"""Nearest native-cell samples for national overview rendering only.

The overview never enters area accounting. Native classes and observation gaps
remain unchanged at the selected source cell; thin waters can disappear at this
scale. Fetch native tiles when zoomed in. Output is deterministic and resumable.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import Affine
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from build_surface_water_national import encode, compact_json
from prepare_surface_water_national import YEARS, sha256, write_json


def build(inputs, boundary, output, factor=32):
    audit = json.loads((inputs/'inputs.json').read_text())
    if not audit['complete'] or audit['boundarySha256'] != sha256(boundary):
        raise ValueError('Complete pinned national audit required')
    # Validate inputs even if every frame is resumed: metadata alone does not
    # prove that the immutable source files still match their audit.
    for entry in audit['files']:
        if Path(entry['file']).name != entry['file'] or sha256(inputs/entry['file']) != entry['sha256']:
            raise ValueError('Overview annual source changed')
    country = unary_union([shape(f['geometry']) for f in json.loads(boundary.read_text())['features']])
    with rasterio.open(inputs/audit['files'][0]['file']) as first:
        native = first.transform
    west, south, east, north = country.bounds
    c0 = math.floor((west-native.c)/native.a/factor)*factor
    r0 = math.floor((north-native.f)/native.e/factor)*factor
    width = math.ceil(((east-native.c)/native.a-c0)/factor)
    height = math.ceil(((south-native.f)/native.e-r0)/factor)
    grid = native*Affine.translation(c0, r0)*Affine.scale(factor)
    mask = rasterize([(mapping(country), 1)], out_shape=(height, width), transform=grid, dtype='uint8') != 0
    xs = grid.c+(np.arange(width)+.5)*grid.a
    ys = grid.f+(np.arange(height)+.5)*grid.e
    stamp = {'auditSha256': sha256(inputs/'inputs.json'), 'boundarySha256': sha256(boundary),
             'builderSha256': sha256(Path(__file__)), 'factor': factor}
    output.mkdir(parents=True, exist_ok=True)
    result = {'schemaVersion': 1, 'stamp': stamp, 'crs': 'EPSG:4326', 'transform': list(grid)[:6],
              'width': width, 'height': height, 'factor': factor, 'years': list(YEARS),
              'method': 'Nearest native cell at overview cell centre; visual only, never analytical',
              'limitation': 'Narrow and small water can disappear; use native detail', 'frames': []}
    for year in YEARS:
        frame_path = output/f'{year}.json'
        if frame_path.exists():
            frame = json.loads(frame_path.read_text())
            if frame['stamp'] == stamp:
                for tile in frame['tiles']:
                    if sha256(output/tile['url']) != tile['sha256']:
                        raise ValueError('Overview resume asset changed')
                result['frames'].append({'year': year, 'url': frame_path.name,
                                         'bytes': frame_path.stat().st_size, 'sha256': sha256(frame_path)})
                continue
        values = np.full(mask.shape, 15, dtype='uint8')
        covered = np.zeros(mask.shape, dtype=bool)
        for entry in audit['files']:
            if entry['year'] != year:
                continue
            source_path = inputs/entry['file']
            if sha256(source_path) != entry['sha256']:
                raise ValueError('Overview annual source changed')
            w, s, e, n = json.loads(entry['downloadEnvelope'])
            cols, rows = np.flatnonzero((xs >= w) & (xs < e)), np.flatnonzero((ys >= s) & (ys < n))
            if not len(cols) or not len(rows):
                continue
            with rasterio.open(source_path) as source:
                native_cols = np.floor((xs[cols]-source.transform.c)/source.transform.a).astype(int)
                native_rows = np.floor((ys[rows]-source.transform.f)/source.transform.e).astype(int)
                # One degree bounds memory independently of national dimensions.
                data = source.read(1, masked=True).filled(0)
                sampled = data[np.ix_(native_rows, native_cols)]
            if covered[np.ix_(rows, cols)].any():
                raise ValueError('Duplicate overview ownership')
            covered[np.ix_(rows, cols)] = True
            values[np.ix_(rows, cols)] = sampled
        if not covered[mask].all() or not np.isin(values, [0, 1, 2, 3, 15]).all():
            raise ValueError('Incomplete or invalid overview')
        values[~mask] = 15
        frame = {'year': year, 'stamp': stamp, 'width': width, 'height': height,
                 'transform': list(grid)[:6], 'tiles': []}
        for row in range(0, height, 512):
            for col in range(0, width, 512):
                data = values[row:row+512, col:col+512]
                if (data == 15).all():
                    continue
                payload = encode(data)
                import hashlib
                digest = hashlib.sha256(payload).hexdigest()
                relative = f'tiles/{digest[:2]}/{digest}.bin.gz'
                target = output/relative
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists() and target.read_bytes() != payload:
                    raise ValueError('Corrupt immutable overview tile')
                if not target.exists():
                    target.write_bytes(payload)
                frame['tiles'].append({'x': col, 'y': row, 'width': data.shape[1], 'height': data.shape[0],
                                       'url': relative, 'bytes': len(payload), 'sha256': digest})
        compact_json(frame_path, frame)
        result['frames'].append({'year': year, 'url': frame_path.name,
                                 'bytes': frame_path.stat().st_size, 'sha256': sha256(frame_path)})
        print(year, sum(t['bytes'] for t in frame['tiles']), 'encoded bytes', flush=True)
    write_json(output/'overview.json', result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parent
    parser.add_argument('--inputs', type=Path, default=root/'data/raw/surface-water/national')
    parser.add_argument('--boundary', type=Path, default=root.parent/'public/data/oblasts.geojson')
    parser.add_argument('--output', type=Path, default=root/'data/raw/surface-water/national-overview-v1')
    args = parser.parse_args()
    build(args.inputs, args.boundary, args.output)
