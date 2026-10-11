"""Extract exact national annual crops on pinned zone-mask grids for area checks.

This reuses a supplied zone's extent; it does not approve its historical extent.
Shared fragment cells use the same centre ownership as the national renderer.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from shapely.geometry import box

from build_surface_water_national import owned_window
from prepare_surface_water_national import YEARS, VERSION, collection, sha256, write_json


def extract(inputs, zones, output):
    audit = json.loads((inputs/'inputs.json').read_text())
    registry = json.loads(zones.read_text())
    if (not audit['complete'] or audit['missing'] or audit['sourceVersion'] != VERSION or
            audit['requestsSha256'] != sha256(inputs/'requests.json')):
        raise ValueError('Complete coherent national source audit required')
    keys = {(e['chunkId'], e['year']) for e in audit['files']}
    chunks = json.loads((inputs/'requests.json').read_text())['chunks']
    if (len(keys) != len(audit['files']) or
            keys != {(c['id'], y) for c in chunks for y in YEARS}):
        raise ValueError('Expected every unique chunk and supported year')
    for entry in audit['files']:
        if (entry['product'] != 'YearlyHistory' or entry['band'] != 'waterClass' or
                entry['collection'] != collection(entry['year']) or
                entry['nationalClipBoundarySha256'] != audit['boundarySha256']):
            raise ValueError('Unexpected exact annual provenance')
    output.mkdir(parents=True, exist_ok=True)
    result = {'purpose': 'Full-year evidence for supplied zones; not historical-zone approval',
              'sourceVersion': audit['sourceVersion'], 'boundarySha256': audit['boundarySha256'],
              'zoneVersion': registry['zoneVersion'], 'zonesSha256': sha256(zones), 'files': []}
    for feature in registry['features']:
        p = feature['properties']
        mask_path = zones.parent/p['maskFile']
        if sha256(mask_path) != p['maskSha256']:
            raise ValueError('Zone mask checksum changed')
        with rasterio.open(mask_path) as mask:
            transform, dimensions = mask.transform, mask.shape
            inside = mask.read(1) != 0
            profile = mask.profile.copy()
            profile.update(driver='GTiff', dtype='uint8', nodata=0, compress='deflate',
                           tiled=True, blockxsize=512, blockysize=512)
            extent = box(*mask.bounds)
        for year in YEARS:
            entries = [e for e in audit['files'] if e['year'] == year and
                       extent.intersects(box(*json.loads(e['downloadEnvelope'])))]
            if not entries:
                raise ValueError('No national fragments cover zone')
            target = output/f"{p['id']}-yearly-{year}.tif"
            receipt_path = output/(target.stem+'.json')
            stamp = {'zonesSha256': result['zonesSha256'], 'maskSha256': p['maskSha256'],
                     'sources': {e['file']: e['sha256'] for e in entries}}
            for e in entries:
                if Path(e['file']).name != e['file'] or sha256(inputs/e['file']) != e['sha256']:
                    raise ValueError('Source changed since audit')
            if target.exists() and receipt_path.exists():
                receipt = json.loads(receipt_path.read_text())
                if receipt['stamp'] == stamp and sha256(target) == receipt['sha256']:
                    result['files'].append(receipt['entry'])
                    continue
            staged = target.with_suffix('.part')
            covered = np.zeros(dimensions, dtype='uint8')
            with rasterio.open(staged, 'w', **profile) as dst:
                for e in entries:
                    with rasterio.open(inputs/e['file']) as src:
                        if (src.crs.to_epsg() != 4326 or not np.allclose(
                                [src.transform.a, src.transform.e], [transform.a, transform.e], rtol=0, atol=1e-15)):
                            raise ValueError('Incompatible native cell spacing')
                        offset = [(src.transform.c-transform.c)/transform.a,
                                  (src.transform.f-transform.f)/transform.e]
                        if any(abs(v-round(v)) > 1e-7 for v in offset):
                            raise ValueError('National fragment moved off zone grid')
                        dx, dy = map(round, offset)
                        owned = owned_window(src.transform, json.loads(e['downloadEnvelope']), src.width, src.height)
                        left = max(0, dx+int(owned.col_off))
                        top = max(0, dy+int(owned.row_off))
                        right = min(dimensions[1], dx+int(owned.col_off+owned.width))
                        bottom = min(dimensions[0], dy+int(owned.row_off+owned.height))
                        for row in range(top, bottom, 512):
                            for col in range(left, right, 512):
                                height, width = min(512, bottom-row), min(512, right-col)
                                if covered[row:row+height, col:col+width].any():
                                    raise ValueError('Duplicate native-cell ownership')
                                covered[row:row+height, col:col+width] = 1
                                data = src.read(1, window=Window(col-dx, row-dy, width, height), masked=True).filled(0)
                                if not np.isin(data, [0, 1, 2, 3]).all():
                                    raise ValueError('Undocumented annual class')
                                dst.write(data, 1, window=Window(col, row, width, height))
            if not covered[inside].all():
                raise ValueError('National fragments do not cover the supplied zone')
            staged.replace(target)
            entry = {'waterbodyId': p['id'], 'year': year, 'product': 'YearlyHistory',
                     'file': target.name, 'sha256': sha256(target), 'classificationSources': stamp['sources']}
            write_json(receipt_path, {'stamp': stamp, 'sha256': entry['sha256'], 'entry': entry})
            result['files'].append(entry)
        print(p['id'], '41 exact native crops', flush=True)
    write_json(output/'inputs.json', result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, default=Path(__file__).resolve().parent/'data/raw/surface-water/national')
    parser.add_argument('--zones', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    extract(args.inputs, args.zones, args.output)
