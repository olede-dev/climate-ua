"""Build a local native-class tile renderer for phase-01 evidence, never publish."""
import argparse
import hashlib
import gzip
import json
from pathlib import Path
import shutil
import time

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parent


def build(inputs, zones, output, areas=None, encoding='png'):
    manifest = json.loads((inputs / 'inputs.json').read_text())
    registry = json.loads(zones.read_text())
    features = {f['properties']['id']: f for f in registry['features']}
    output.mkdir(parents=True, exist_ok=True)
    result = {'purpose': 'Experimental native-class tile map; source gaps and candidate boundaries are explicit',
              'sourceAttribution': registry['attribution'], 'zoneStatus': registry['status'],
              'tileSize': 512, 'encoding': encoding, 'bodies': {}, 'files': []}
    start = time.perf_counter()
    for entry in manifest['files']:
        if entry['product'] not in ('YearlyHistory', 'yearly'):
            continue
        src = inputs / entry['file']
        if hashlib.sha256(src.read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError('Input checksum changed')
        body, year = entry['waterbodyId'], entry['year']
        feature = features[body]
        target = output / body / str(year)
        target.mkdir(parents=True, exist_ok=True)
        with rasterio.open(src) as r:
            frame = {'year': year, 'width': r.width, 'height': r.height,
                     'bounds': list(r.bounds), 'transform': list(r.transform)[:6], 'tiles': [], 'counts': [0, 0, 0, 0]}
            for row in range(0, r.height, 512):
                for col in range(0, r.width, 512):
                    w = Window(col, row, min(512, r.width-col), min(512, r.height-row))
                    data = r.read(1, window=w, masked=True).filled(0)
                    inside = rasterize([(feature['geometry'], 1)], out_shape=data.shape,
                                       transform=r.window_transform(w), dtype='uint8')
                    if not inside.any():
                        continue
                    counts = np.bincount(data[inside != 0], minlength=4)
                    frame['counts'] = [a+int(b) for a,b in zip(frame['counts'],counts)]
                    data[inside == 0] = 255
                    if encoding == 'packed4-gzip':
                        values = np.where(data == 255, 15, data).astype('uint8').ravel()
                        padded = np.pad(values, (0, len(values) % 2), constant_values=15)
                        packed = padded[::2] | (padded[1::2] << 4)
                        tile = target / f'{col}-{row}.bin.gz'
                        tile.write_bytes(gzip.compress(packed.tobytes(), mtime=0))
                        decoded = np.frombuffer(gzip.decompress(tile.read_bytes()), dtype='uint8')
                        decoded = np.stack([decoded & 15, decoded >> 4], axis=1).ravel()[:len(values)]
                        if not np.array_equal(values, decoded):
                            raise ValueError('Packed class roundtrip failed')
                    else:
                        tile = target / f'{col}-{row}.png'
                        with rasterio.open(tile, 'w', driver='PNG', width=data.shape[1], height=data.shape[0],
                                           count=1, dtype='uint8') as png:
                            png.write(data, 1)
                        with rasterio.open(tile) as png:
                            if not np.array_equal(data, png.read(1)):
                                raise ValueError('PNG class roundtrip failed')
                    frame['tiles'].append({'x': col, 'y': row, 'width': data.shape[1],
                                           'height': data.shape[0], 'url': str(tile.relative_to(output)),
                                           'bytes': tile.stat().st_size})
        group = result['bodies'].setdefault(body, {'name': feature['properties']['nameUk'], 'frames': []})
        group['frames'].append(frame)
        result['files'].append({'body': body, 'year': year, 'tileCount': len(frame['tiles']),
                                'bytes': sum(t['bytes'] for t in frame['tiles'])})
        print(body, year, len(frame['tiles']), 'tiles', flush=True)
    for group in result['bodies'].values():
        group['frames'].sort(key=lambda f: f['year'])
    if areas is not None:
        numeric = json.loads(areas.read_text())
        if numeric['zoneVersion'] != registry['zoneVersion']:
            raise ValueError('Map and numeric zone versions differ')
        shutil.copy2(areas, output / 'zone-areas.json')
        result['areasUrl'] = 'zone-areas.json'
    (output / 'demo.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    shutil.copy2(ROOT.parent / 'scripts/surface-water-demo.html', output / 'index.html')
    metrics = {'buildSeconds': time.perf_counter()-start, 'bytes': sum(f['bytes'] for f in result['files']),
               'tileCount': sum(f['tileCount'] for f in result['files']), 'sourceFiles': len(result['files'])}
    (output / 'build-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
    print(metrics)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, default=ROOT / 'data/raw/surface-water/earth-engine')
    parser.add_argument('--zones', type=Path, default=ROOT / 'data/raw/surface-water/prototype/candidate-zones.geojson')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/raw/surface-water/prototype/demo')
    parser.add_argument('--areas', type=Path)
    parser.add_argument('--encoding', choices=['png', 'packed4-gzip'], default='png')
    args = parser.parse_args()
    build(args.inputs, args.zones, args.output, args.areas, args.encoding)
