"""Build automatic local-waterbody zones from OSM standing-water polygons.

Each polygon plus a size-scaled buffer bounds a corridor; the zone is the dominant
connected union of all observed native water 1984–2022 inside it, as in the
reviewed catalogue but without manual review. Candidates touching a reviewed
catalogue zone are left to that zone. Output feeds the same extraction and
area accounting as the catalogue; it is local evidence, not a release.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize, shapes
from rasterio.transform import Affine
from rasterio.windows import Window
from scipy.ndimage import label
from shapely import STRtree, distance, points
from shapely.geometry import box, mapping, shape
from shapely.ops import transform, unary_union
from pyproj import Transformer

from extract_surface_water_national import extract
from prepare_surface_water_national import sha256, write_json
from surface_water import GEOGRAPHIC_TO_AREA, geographic_intersection_areas

ZONE_VERSION = 'ukraine-local-osm-1984-2022-1'
INVERSE = Transformer.from_crs(6933, 4326, always_xy=True)
# A dried or misidentified basin keeps too little observed water to chart.
MIN_FOOTPRINT_M2 = 5e5
# The national source is masked to the land boundary, so coastal lagoons and
# border waters lose most cells; a partial footprint would chart a false trend.
MIN_OSM_SHARE = .6


def buffer_m(area_m2):
    """Wide enough for historical shoreline shifts, narrow enough to spare neighbours."""
    return min(300., max(60., .2*math.sqrt(area_m2)))


def candidates(lakes, reviewed):
    taken = STRtree([transform(GEOGRAPHIC_TO_AREA.transform, shape(f['geometry'])).buffer(750)
                     for f in json.loads(reviewed.read_text())['features']])
    kept, skipped = [], []
    for feature in json.loads(lakes.read_text())['features']:
        p = feature['properties']
        polygon = transform(GEOGRAPHIC_TO_AREA.transform, shape(feature['geometry']))
        if p['water'] == 'bay':
            skipped.append({'osmId': p['osmId'], 'reason': 'sea bay'})
            continue
        if len(taken.query(polygon, predicate='intersects')):
            skipped.append({'osmId': p['osmId'], 'reason': 'reviewed catalogue zone'})
            continue
        # Larger polygons come first; a duplicate or nested polygon adds no new body.
        if any(polygon.intersection(k['polygon']).area > .5*polygon.area for k in kept
               if k['polygon'].intersects(polygon)):
            skipped.append({'osmId': p['osmId'], 'reason': 'duplicate of a larger polygon'})
            continue
        kept.append({**p, 'id': p['osmId'].replace('/', '-'), 'polygon': polygon})
    return kept, skipped


def write_weights(path, water, grid, profile, country, country_area):
    profile = {**profile, 'dtype': 'float64'}
    total = 0.
    x0, _ = GEOGRAPHIC_TO_AREA.transform(grid.c, 0)
    x1, _ = GEOGRAPHIC_TO_AREA.transform(grid.c+grid.a, 0)
    with rasterio.open(path, 'w', **profile) as dst:
        for row in range(0, water.shape[0], 64):
            height = min(64, water.shape[0]-row)
            selected = water[row:row+height]
            lats = grid.f+(row+np.arange(height+1))*grid.e
            _, ys = GEOGRAPHIC_TO_AREA.transform(np.zeros_like(lats), lats)
            weights = np.broadcast_to((ys[:-1]-ys[1:])[:, None]*(x1-x0), selected.shape).copy()
            strip = box(grid.c, grid.f+(row+height)*grid.e, grid.c+water.shape[1]*grid.a, grid.f+row*grid.e)
            if selected.any() and not country.covers(strip):
                sx0, sy0 = GEOGRAPHIC_TO_AREA.transform(strip.bounds[0], strip.bounds[1])
                sx1, sy1 = GEOGRAPHIC_TO_AREA.transform(strip.bounds[2], strip.bounds[3])
                local = country_area.intersection(box(sx0, sy0, sx1, sy1))
                weights = (np.zeros(selected.shape) if local.is_empty else
                           geographic_intersection_areas(grid, selected.shape, local, row_off=row))
            weights *= selected
            total += float(weights.sum())
            dst.write(weights, 1, window=Window(0, row, water.shape[1], height))
    return total


def build(inputs, lakes, reviewed, boundary, output):
    output.mkdir(parents=True, exist_ok=True)
    country = unary_union([shape(f['geometry']) for f in json.loads(boundary.read_text())['features']])
    country_area = transform(GEOGRAPHIC_TO_AREA.transform, country)
    audit = json.loads((inputs/'inputs.json').read_text())
    with rasterio.open(inputs/audit['files'][0]['file']) as source:
        base = source.transform
    bodies, skipped = candidates(lakes, reviewed)
    for body in bodies:
        body['corridor'] = body['polygon'].buffer(buffer_m(body['polygon'].area))
    tree = STRtree([b['corridor'] for b in bodies])
    registry = {'type': 'FeatureCollection', 'zoneVersion': ZONE_VERSION,
                'status': 'automatic; no manual review',
                'attribution': 'Source: EC JRC/Google; © OpenStreetMap contributors, ODbL-1.0; Natural Earth public domain',
                'features': []}
    grids = {}
    for body in bodies:
        corridor = transform(INVERSE.transform, body['corridor']).intersection(country)
        if corridor.is_empty:
            skipped.append({'osmId': body['osmId'], 'reason': 'outside Ukraine'})
            continue
        west, south, east, north = corridor.bounds
        c0, c1 = math.floor((west-base.c)/base.a)-1, math.ceil((east-base.c)/base.a)+1
        r0, r1 = math.floor((north-base.f)/base.e)-1, math.ceil((south-base.f)/base.e)+1
        grid, dimensions = base*Affine.translation(c0, r0), (r1-r0, c1-c0)
        inside = rasterize([(mapping(corridor), 1)], out_shape=dimensions, transform=grid, dtype='uint8')
        mask = output/(body['id']+'-corridor.tif')
        with rasterio.open(mask, 'w', driver='GTiff', height=dimensions[0], width=dimensions[1], count=1,
                           dtype='uint8', crs='EPSG:4326', transform=grid, compress='deflate', tiled=True) as dst:
            dst.write(inside, 1)
        grids[body['id']] = grid
        registry['features'].append({'type': 'Feature', 'geometry': mapping(corridor),
                                     'properties': {'id': body['id'], 'maskFile': mask.name, 'maskSha256': sha256(mask)}})
    write_json(output/'corridors.geojson', registry)
    extract(inputs, output/'corridors.geojson', output/'annual-inputs')
    sources = json.loads((output/'annual-inputs/inputs.json').read_text())['files']
    by_body = {}
    for entry in sources:
        by_body.setdefault(entry['waterbodyId'], []).append(entry)
    index = {b['id']: i for i, b in enumerate(bodies)}
    final = {**registry, 'features': []}
    for feature in registry['features']:
        body = bodies[index[feature['properties']['id']]]
        with rasterio.open(output/feature['properties']['maskFile']) as mask:
            inside, grid, profile = mask.read(1) != 0, mask.transform, mask.profile.copy()
        water = np.zeros(inside.shape, dtype=bool)
        entries = [e for e in by_body[body['id']] if e['year'] <= 2022]
        for entry in entries:
            with rasterio.open(output/'annual-inputs'/entry['file']) as source:
                water |= source.read(1, masked=True).filled(0) >= 2
        water &= inside
        # Shared corridor cells go to the nearer OSM polygon; ties to the larger body.
        for j in tree.query(body['corridor'], predicate='intersects'):
            other = bodies[j]
            if other is body:
                continue
            shared = rasterize([(mapping(transform(INVERSE.transform, other['corridor'])), 1)],
                               out_shape=water.shape, transform=grid, dtype='uint8') != 0
            rows, cols = np.nonzero(water & shared)
            if not len(rows):
                continue
            x, y = GEOGRAPHIC_TO_AREA.transform(grid.c+(cols+.5)*grid.a, grid.f+(rows+.5)*grid.e)
            cells = points(x, y)
            ours, theirs = distance(cells, body['polygon']), distance(cells, other['polygon'])
            lose = (theirs < ours) | ((theirs == ours) & (j < index[body['id']]))
            water[rows[lose], cols[lose]] = False
        components, _ = label(water)
        sizes = np.bincount(components.ravel())
        sizes[0] = 0
        main = int(sizes.argmax())
        water = components == main
        if main == 0:
            skipped.append({'osmId': body['osmId'], 'reason': 'no observed water'})
            continue
        footprint = unary_union([shape(g) for g, value in shapes(water.astype('uint8'), mask=water,
                                                               transform=grid) if value == 1])
        area_zone = transform(GEOGRAPHIC_TO_AREA.transform, footprint).intersection(country_area)
        if area_zone.area < MIN_FOOTPRINT_M2:
            skipped.append({'osmId': body['osmId'], 'reason': 'observed footprint below 0.5 km²'})
            continue
        if area_zone.area < MIN_OSM_SHARE*body['osmM2']:
            skipped.append({'osmId': body['osmId'], 'reason': 'observed footprint below 60% of OSM polygon'})
            continue
        clipped = transform(INVERSE.transform, area_zone)
        mask_path, weights_path = output/(body['id']+'-zone-mask.tif'), output/(body['id']+'-weights.tif')
        with rasterio.open(mask_path, 'w', **profile) as dst:
            dst.write(water.astype('uint8'), 1)
        total = write_weights(weights_path, water, grid, profile, country, country_area)
        if abs(total-area_zone.area) > max(1e-5, area_zone.area*1e-9):
            raise ValueError(f"Footprint and native intersection weights differ: {body['id']}")
        marker = clipped.representative_point()
        final['features'].append({'type': 'Feature', 'geometry': mapping(clipped), 'properties': {
            'id': body['id'], 'osmId': body['osmId'], 'nameUk': body['nameUk'], 'nameEn': body['nameEn'],
            'water': body['water'], 'osmM2': body['osmM2'], 'zoneVersion': ZONE_VERSION, 'zoneM2': total,
            'markerCoordinates': [marker.x, marker.y], 'historicalPixels': int(water.sum()),
            'dominantShare': float(sizes[main]/sizes.sum()),
            'maskFile': mask_path.name, 'maskSha256': sha256(mask_path),
            'weightsFile': weights_path.name, 'weightsSha256': sha256(weights_path),
            'boundarySha256': sha256(boundary), 'reviewStatus': 'automatic'}})
    write_json(output/'analysis-zones.geojson', final)
    write_json(output/'skipped.json', skipped)
    print(len(final['features']), 'zones;', len(skipped), 'skipped')
    return final


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parent
    raw = root/'data/raw/surface-water'
    parser.add_argument('--inputs', type=Path, default=raw/'national')
    parser.add_argument('--lakes', type=Path, default=raw/'local-catalogue/osm-lakes.geojson')
    parser.add_argument('--reviewed', type=Path, default=raw/'catalogue-full-history/analysis-zones.geojson')
    parser.add_argument('--boundary', type=Path, default=root.parent/'public/data/oblasts.geojson')
    parser.add_argument('--output', type=Path, default=raw/'local-catalogue')
    args = parser.parse_args()
    build(args.inputs, args.lakes, args.reviewed, args.boundary, args.output)
