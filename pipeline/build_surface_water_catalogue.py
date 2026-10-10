"""Build fixed full-history catalogue candidates and exact country intersections.

Identity corridors constrain attribution, never supply the observed footprint.
All native water through 2022 is considered, including disconnected shore cells.
Nearest historical identity resolves corridor overlap deterministically. Review
the generated evidence before making a release; this command cannot approve it.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize, shapes
from rasterio.transform import Affine
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union
from pyproj import Transformer

from extract_surface_water_national import extract
from prepare_surface_water_national import sha256, write_json
from surface_water import GEOGRAPHIC_TO_AREA, geographic_intersection_areas

NAMES = {
    'kyiv': ('Київське водосховище', 'Kyiv Reservoir'),
    'kaniv': ('Канівське водосховище', 'Kaniv Reservoir'),
    'kremenchuk': ('Кременчуцьке водосховище', 'Kremenchuk Reservoir'),
    'kamianske': ("Кам’янське водосховище", 'Kamianske Reservoir'),
    'dnipro': ('Дніпровське водосховище', 'Dnipro Reservoir'),
    'kakhovka': ('Каховське водосховище', 'Kakhovka Reservoir'),
    'dnister': ('Дністровське водосховище', 'Dnister Reservoir'),
    'svitiaz': ('Світязь', 'Lake Svitiaz'),
    'yalpuh': ('Ялпуг', 'Lake Yalpuh'),
    'kuhurlui': ('Кугурлуй', 'Lake Kuhurlui'),
    'donuzlav': ('Донузлав', 'Lake Donuzlav'),
}
ZONE_VERSION = 'ukraine-historical-1984-2022-1'
INVERSE = Transformer.from_crs(6933, 4326, always_xy=True)


def build(inputs, identities, boundary, output):
    output.mkdir(parents=True, exist_ok=True)
    country = unary_union([shape(f['geometry']) for f in json.loads(boundary.read_text())['features']])
    country_area = transform(GEOGRAPHIC_TO_AREA.transform, country)
    audit = json.loads((inputs/'inputs.json').read_text())
    first = audit['files'][0]
    with rasterio.open(inputs/first['file']) as source:
        base = source.transform
    originals = {body: json.loads((identities/body/'identity.geojson').read_text()) for body in NAMES}
    projected = {body: transform(GEOGRAPHIC_TO_AREA.transform, shape(f['geometry']))
                 for body, f in originals.items()}
    corridors = {body: transform(INVERSE.transform, g.buffer(750))
                 for body, g in projected.items()}
    registry = {'type': 'FeatureCollection', 'zoneVersion': ZONE_VERSION,
                'status': 'candidate; full-history visual review required',
                'attribution': 'Source: EC JRC/Google; © OpenStreetMap contributors, ODbL-1.0; Natural Earth public domain',
                'features': []}
    for body, corridor in corridors.items():
        west, south, east, north = corridor.bounds
        c0, c1 = math.floor((west-base.c)/base.a)-1, math.ceil((east-base.c)/base.a)+1
        r0, r1 = math.floor((north-base.f)/base.e)-1, math.ceil((south-base.f)/base.e)+1
        grid = base * Affine.translation(c0, r0)
        dimensions = (r1-r0, c1-c0)
        inside = rasterize([(mapping(corridor.intersection(country)), 1)],
                           out_shape=dimensions, transform=grid, dtype='uint8')
        mask = output/(body+'-corridor.tif')
        with rasterio.open(mask, 'w', driver='GTiff', height=dimensions[0], width=dimensions[1],
                           count=1, dtype='uint8', crs='EPSG:4326', transform=grid,
                           compress='deflate', tiled=True) as dst:
            dst.write(inside, 1)
        registry['features'].append({'type': 'Feature', 'geometry': mapping(corridor.intersection(country)),
                                    'properties': {'id': body, 'maskFile': mask.name, 'maskSha256': sha256(mask)}})
    write_json(output/'corridors.geojson', registry)
    extract(inputs, output/'corridors.geojson', output/'annual-inputs')
    sources = json.loads((output/'annual-inputs/inputs.json').read_text())['files']
    final = {**registry, 'features': []}
    for feature in registry['features']:
        body = feature['properties']['id']
        with rasterio.open(output/feature['properties']['maskFile']) as mask:
            inside, grid, profile = mask.read(1) != 0, mask.transform, mask.profile.copy()
        water = np.zeros(inside.shape, dtype=bool)
        entries = [e for e in sources if e['waterbodyId'] == body and e['year'] <= 2022]
        for entry in entries:
            path = output/'annual-inputs'/entry['file']
            if sha256(path) != entry['sha256']:
                raise ValueError('Annual crop changed')
            with rasterio.open(path) as source:
                water |= source.read(1, masked=True).filled(0) >= 2
        water &= inside
        # One cell may occur in two buffered corridors. Assign it to the nearer
        # unbuffered historical polygon; ties follow the stable catalogue order.
        overlap_removed = 0
        for other in NAMES:
            if other == body or not corridors[body].intersects(corridors[other]):
                continue
            shared = rasterize([(mapping(corridors[other]), 1)], out_shape=water.shape,
                               transform=grid, dtype='uint8') != 0
            rows, cols = np.nonzero(water & shared)
            if not len(rows):
                continue
            from shapely import points, distance
            x, y = GEOGRAPHIC_TO_AREA.transform(grid.c+(cols+.5)*grid.a, grid.f+(rows+.5)*grid.e)
            cells = points(x, y)
            ours, theirs = distance(cells, projected[body]), distance(cells, projected[other])
            lose = (theirs < ours) | ((theirs == ours) & (list(NAMES).index(other) < list(NAMES).index(body)))
            water[rows[lose], cols[lose]] = False
            overlap_removed += int(lose.sum())
        from scipy.ndimage import label
        components, _ = label(water)
        sizes = np.bincount(components.ravel())
        sizes[0] = 0
        main = int(sizes.argmax())
        disconnected = int(water.sum()-sizes[main])
        if main == 0 or sizes[main]/water.sum() < .9:
            raise ValueError('Historical identity lacks a dominant coherent water footprint; manual routing required')
        water = components == main
        footprint = unary_union([shape(g) for g, value in shapes(water.astype('uint8'), mask=water,
                                                               transform=grid) if value == 1])
        # Intersect in the area CRS, the same straight-edge boundary convention
        # used by native-cell weights. Geographic clipping before projection
        # changes sloping country segments because the projection is nonlinear.
        area_zone = transform(GEOGRAPHIC_TO_AREA.transform, footprint).intersection(country_area)
        clipped = transform(INVERSE.transform, area_zone)
        if clipped.is_empty or not clipped.is_valid:
            raise ValueError('Invalid full-history footprint')
        mask_path, weights_path = output/(body+'-zone-mask.tif'), output/(body+'-weights.tif')
        with rasterio.open(mask_path, 'w', **profile) as dst:
            dst.write(water.astype('uint8'), 1)
        profile.update(dtype='float64')
        total = 0.
        with rasterio.open(weights_path, 'w', **profile) as dst:
            for row in range(0, water.shape[0], 64):
                from rasterio.windows import Window
                height = min(64, water.shape[0]-row)
                selected = water[row:row+height]
                lats = grid.f+(row+np.arange(height+1))*grid.e
                _, ys = GEOGRAPHIC_TO_AREA.transform(np.zeros_like(lats), lats)
                x0, _ = GEOGRAPHIC_TO_AREA.transform(grid.c, 0)
                x1, _ = GEOGRAPHIC_TO_AREA.transform(grid.c+grid.a, 0)
                weights = np.broadcast_to((ys[:-1]-ys[1:])[:, None]*(x1-x0), selected.shape).copy()
                # Exact fractional country intersections only when the strip
                # touches the national edge, with no resampling of classes.
                from shapely.geometry import box
                strip = box(grid.c, grid.f+(row+height)*grid.e,
                            grid.c+water.shape[1]*grid.a, grid.f+row*grid.e)
                if selected.any() and not country.covers(strip):
                    sx0, sy0 = GEOGRAPHIC_TO_AREA.transform(strip.bounds[0], strip.bounds[1])
                    sx1, sy1 = GEOGRAPHIC_TO_AREA.transform(strip.bounds[2], strip.bounds[3])
                    local_country = country_area.intersection(box(sx0, sy0, sx1, sy1))
                    if local_country.is_empty:
                        weights[:] = 0
                    else:
                        weights = geographic_intersection_areas(grid, selected.shape, local_country, row_off=row)
                weights *= selected
                total += float(weights.sum())
                dst.write(weights, 1, window=Window(0, row, water.shape[1], height))
        if abs(total-area_zone.area) > max(1e-5, area_zone.area*1e-9):
            raise ValueError(f'Independent footprint and native intersection weights differ: {body} {total} {area_zone.area}')
        props = {'id': body, 'nameUk': NAMES[body][0], 'nameEn': NAMES[body][1],
                 'type': 'reservoir' if body in list(NAMES)[:7] else 'lake',
                 'zoneVersion': ZONE_VERSION, 'zoneM2': total, 'historicalPixels': int(water.sum()),
                 'maskFile': mask_path.name, 'maskSha256': sha256(mask_path),
                 'weightsFile': weights_path.name, 'weightsSha256': sha256(weights_path),
                 'identitySha256': sha256(identities/body/'identity.geojson'),
                 'boundarySha256': sha256(boundary), 'classificationSources': entries,
                 'method': 'Dominant 4-connected union of all observed native water 1984–2022 in historical identity + 750 m; nearest identity overlap ownership; exact country clipping',
                 'overlapRemovedPixels': overlap_removed,
                 'disconnectedExcludedPixels': disconnected,
                 'exclusionReason': 'Other waterways beyond identity corridor; disconnected ponds and wetland pixels inside it. Catalogue is a fixed coherent waterbody footprint, not its whole catchment.',
                 'countryClippedM2': transform(GEOGRAPHIC_TO_AREA.transform, footprint).area-total,
                 'inclusionReason': 'Required reference catalogue' if body != 'donuzlav' else 'Crimean coastal lake; national coverage reference',
                 'reviewStatus': 'candidate'}
        final['features'].append({'type': 'Feature', 'geometry': mapping(clipped), 'properties': props})
        print(body, round(total/1e6, 3), 'km²', 'overlap removed', overlap_removed, flush=True)
    for i, a in enumerate(final['features']):
        for b in final['features'][i+1:]:
            if shape(a['geometry']).intersection(shape(b['geometry'])).area > 1e-12:
                raise ValueError('Catalogue zones overlap')
    write_json(output/'analysis-zones.geojson', final)
    return final


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parent
    parser.add_argument('--inputs', type=Path, default=root/'data/raw/surface-water/national')
    parser.add_argument('--identities', type=Path, default=root/'data/raw/surface-water/catalogue-archive-identities')
    parser.add_argument('--boundary', type=Path, default=root.parent/'public/data/oblasts.geojson')
    parser.add_argument('--output', type=Path, default=root/'data/raw/surface-water/catalogue-full-history')
    args = parser.parse_args()
    build(args.inputs, args.identities, args.boundary, args.output)
