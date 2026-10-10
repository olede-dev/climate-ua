"""Generate candidate fixed historical footprints; inspect before accepting.

Uses the 1984/2015/2021 archive union, not today's water. No national catalogue
is produced. Natural Earth buffers constrain reservoir identity; Lake Svitiaz
uses the seeded connected component. All output is prototype evidence only.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize, shapes
from scipy.ndimage import label
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union

from surface_water import GEOGRAPHIC_TO_AREA
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent
AREA_TO_GEOGRAPHIC = Transformer.from_crs(6933, 4326, always_xy=True)
SEEDS = {'kakhovka': (34.06753603965993, 47.3428435),
         'kremenchuk': (32.726445341813346, 49.28756), 'svitiaz': (23.85, 51.49)}
NAMES = {'kakhovka': ('Каховське водосховище', 'Kakhovka Reservoir'),
         'kremenchuk': ('Кременчуцьке водосховище', 'Kremenchuk Reservoir'),
         'svitiaz': ('Світязь', 'Lake Svitiaz')}


def build(inputs, natural_earth, output, kremenchuk_boundary=None, reviewed=False):
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((inputs / 'inputs.json').read_text())
    ne = json.loads(natural_earth.read_text())
    result = {'type': 'FeatureCollection', 'zoneVersion': 'prototype-historical-2-candidate',
              'status': 'Candidate: requires visual extent and neighbouring-water review',
              'attribution': 'Source: EC JRC/Google; Natural Earth public domain', 'features': []}
    if kremenchuk_boundary is not None:
        result['attribution'] += '; © OpenStreetMap contributors, ODbL-1.0 (Kremenchuk boundary constraint)'
    if reviewed:
        if kremenchuk_boundary is None:
            raise ValueError('Reviewed prototype requires the full Kremenchuk identity constraint')
        result['zoneVersion'] = 'prototype-historical-2'
        result['status'] = 'Reviewed three-waterbody prototype baseline; production requires full historical catalogue review'
    for body, seed in SEEDS.items():
        entries = sorted((e for e in manifest['files'] if e['waterbodyId'] == body and
                          e['product'] in ('yearly', 'YearlyHistory') and e['year'] <= 2022), key=lambda e: e['year'])
        if not {1984, 2015, 2021}.issubset({e['year'] for e in entries}):
            raise ValueError('Zone generation requires pinned early and late historical samples')
        water = None
        source_hashes = []
        for entry in entries:
            path = inputs / entry['file']
            checksum = hashlib.sha256(path.read_bytes()).hexdigest()
            if checksum != entry['sha256']:
                raise ValueError('Historical crop checksum mismatch')
            with rasterio.open(path) as r:
                if r.crs.to_epsg() != 4326 or r.count != 1:
                    raise ValueError('Expected geographic annual source')
                if water is None:
                    affine, dimensions = r.transform, r.shape
                    water = np.zeros(r.shape, dtype=bool)
                if r.shape != dimensions or not np.allclose(list(r.transform), list(affine), rtol=0, atol=1e-10):
                    raise ValueError('Historical sources must share an exact grid')
                data = r.read(1, masked=True).filled(0)
                if not np.isin(data, [0, 1, 2, 3]).all():
                    raise ValueError('Undocumented annual classes')
                water |= data >= 2
            source_hashes.append({'year': entry['year'], 'file': entry['file'], 'sha256': checksum})
        if body != 'svitiaz':
            candidate = next(f for f in ne['features'] if f['properties']['name'] == NAMES[body][1])
            if body == 'kremenchuk' and kremenchuk_boundary is not None:
                candidate = json.loads(kremenchuk_boundary.read_text())
            coarse = shape(candidate['geometry'])
            if body == 'kremenchuk' and kremenchuk_boundary is not None:
                bounds = rasterio.transform.array_bounds(*dimensions, affine)
                west, south, east, north = coarse.bounds
                if not (bounds[0] < west and bounds[1] < south and bounds[2] > east and bounds[3] > north):
                    raise ValueError('Kremenchuk export clips the historical identity boundary; use expanded exports')
            corridor = transform(AREA_TO_GEOGRAPHIC.transform,
                                 transform(GEOGRAPHIC_TO_AREA.transform, coarse).buffer(750))
            water &= rasterize([(mapping(corridor), 1)], out_shape=dimensions,
                               transform=affine, dtype='uint8') == 1
        components, count = label(water)
        row, col = rasterio.transform.rowcol(affine, *seed)
        selected = components[row, col]
        if selected == 0:
            raise ValueError(f'Historical identity seed is not water: {body}')
        footprint = components == selected
        polygon = unary_union([shape(g) for g, v in shapes(footprint.astype('uint8'),
                                   mask=footprint, transform=affine) if v == 1])
        if polygon.is_empty or not polygon.is_valid:
            raise ValueError('Invalid fixed historical footprint')
        projected = transform(GEOGRAPHIC_TO_AREA.transform, polygon)
        properties = {'id': body, 'nameUk': NAMES[body][0], 'nameEn': NAMES[body][1],
                      'type': 'lake' if body == 'svitiaz' else 'reservoir', 'seed': seed,
                      'zoneVersion': result['zoneVersion'], 'zoneM2': projected.area,
                      'method': '4-connected union of supplied observed water years through 2022; reservoir identity corridor = Natural Earth + 750 m in EPSG:6933',
                      'classificationSources': source_hashes, 'historicalPixels': int(footprint.sum()),
                      'excludedWaterPixels': int(water.sum() - footprint.sum()),
                      'naturalEarthSha256': hashlib.sha256(natural_earth.read_bytes()).hexdigest()
                          if body != 'svitiaz' else None,
                      'nameProvenance': 'Natural Earth v5.1.2' if body != 'svitiaz' else 'Shatskyi National Nature Park: https://shnp.forest.gov.ua/location/ozero-nesamovyte/ (name/type only); English transliteration follows the approved plan'}
        mask_path = output.parent / (body + '-zone-mask.tif')
        with rasterio.open(mask_path, 'w', driver='GTiff', width=dimensions[1], height=dimensions[0],
                           count=1, dtype='uint8', crs='EPSG:4326', transform=affine, compress='deflate') as dst:
            dst.write(footprint.astype('uint8'), 1)
        properties['maskFile'] = mask_path.name
        properties['maskSha256'] = hashlib.sha256(mask_path.read_bytes()).hexdigest()
        if body == 'kremenchuk' and kremenchuk_boundary is not None:
            properties['boundaryConstraint'] = {**candidate['properties'], 'paddingM': 750,
                'sha256': hashlib.sha256(kremenchuk_boundary.read_bytes()).hexdigest()}
            properties['naturalEarthSha256'] = None
            properties['method'] = properties['method'].replace('Natural Earth', 'OSM 2022-12-31')
            properties['nameProvenance'] = 'OSM relation 2289192 at 2022-12-31T23:59:59Z'
        result['features'].append({'type': 'Feature', 'properties': properties, 'geometry': mapping(polygon)})
        print(body, 'km2', round(projected.area / 1e6, 3), 'excluded pixels', properties['excludedWaterPixels'], flush=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.part')
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, default=ROOT / 'data/raw/surface-water/source-audit/inputs')
    parser.add_argument('--natural-earth', type=Path, default=ROOT / 'data/raw/surface-water/ne_10m_lakes-v5.1.2.geojson')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/raw/surface-water/prototype/candidate-zones.geojson')
    parser.add_argument('--kremenchuk-boundary', type=Path)
    parser.add_argument('--reviewed', action='store_true', help='Record completed visual extent/identity review; never inferred automatically')
    args = parser.parse_args()
    build(args.inputs, args.natural_earth, args.output, args.kremenchuk_boundary, args.reviewed)
