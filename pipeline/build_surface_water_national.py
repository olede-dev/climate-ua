"""Build resumable native national tiles in ignored storage; never publish.

Each native cell belongs to the one-degree envelope containing its centre.
Country-exterior cells are 15; unobserved country cells remain 0. Content hashes
allow identical annual tiles to share one immutable asset without resampling.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import gzip
import hashlib
import json
import math
from pathlib import Path
import time
from threading import Lock

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import Window
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

from prepare_surface_water_national import YEARS, VERSION, collection, sha256, write_json

ROOT = Path(__file__).resolve().parent
PROCESSING_VERSION = 'national-packed4-1'
TILE_SIZE = 512
ASSET_LOCK = Lock()


def owned_window(transform, envelope, width, height):
    """Half-open centre ownership: west <= x < east, south <= y < north."""
    west, south, east, north = envelope
    # Round near integer boundaries to neutralize upstream serialization noise.
    def snap(value):
        return round(value) if abs(value - round(value)) < 1e-7 else value
    c0 = math.ceil(snap((west - transform.c) / transform.a - .5))
    c1 = math.ceil(snap((east - transform.c) / transform.a - .5))
    r0 = math.floor(snap((north - transform.f) / transform.e - .5)) + 1
    r1 = math.floor(snap((south - transform.f) / transform.e - .5)) + 1
    if not (0 <= c0 < c1 <= width and 0 <= r0 < r1 <= height):
        raise ValueError('Source does not cover owned native cells')
    return Window(c0, r0, c1-c0, r1-r0)


def encode(values):
    flat = np.asarray(values, dtype='uint8').ravel()
    if not np.isin(flat, [0, 1, 2, 3, 15]).all():
        raise ValueError('Undocumented tile class')
    padded = np.pad(flat, (0, len(flat) % 2), constant_values=15)
    payload = gzip.compress((padded[::2] | (padded[1::2] << 4)).tobytes(), mtime=0)
    packed = np.frombuffer(gzip.decompress(payload), dtype='uint8')
    decoded = np.stack([packed & 15, packed >> 4], axis=1).ravel()[:len(flat)]
    if not np.array_equal(decoded, flat):
        raise ValueError('Tile roundtrip changed classes')
    return payload


def compact_json(path, value):
    data = (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode()
    temporary = path.with_suffix(path.suffix + '.part')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary.write_bytes(data)
    temporary.replace(path)


def build_chunk(chunk, entries, inputs, country, output, identity):
    index_path = output / 'frames' / (chunk['id'] + '.json')
    stamp = {'buildIdentity': identity, 'sources': [{k: e[k] for k in
             ('year', 'sha256', 'file')} for e in entries]}
    # Verify sources even on resume; audit metadata alone cannot authorize skipping.
    for entry in entries:
        if sha256(inputs / entry['file']) != entry['sha256']:
            raise ValueError('Source changed since national audit')
    if index_path.exists():
        previous = json.loads(index_path.read_text())
        if previous['stamp'] == stamp:
            for asset in previous['assets'].values():
                path = output / asset['url']
                if not path.is_file() or sha256(path) != asset['sha256']:
                    raise ValueError('Resume tile checksum mismatch')
            return previous
    result = {'id': chunk['id'], 'stamp': stamp, 'frames': [], 'assets': {}}
    with rasterio.open(inputs / entries[0]['file']) as first:
        owned = owned_window(first.transform, chunk['downloadEnvelope'], first.width, first.height)
        base = first.window_transform(owned)
        dimensions = (int(owned.height), int(owned.width))
        result.update(width=dimensions[1], height=dimensions[0], transform=list(base)[:6])
        clipped = country.intersection(box(*rasterio.windows.bounds(owned, first.transform)))
        geometry = mapping(clipped)
        windows = []
        for row in range(0, dimensions[0], TILE_SIZE):
            for col in range(0, dimensions[1], TILE_SIZE):
                w = Window(owned.col_off+col, owned.row_off+row,
                           min(TILE_SIZE, dimensions[1]-col), min(TILE_SIZE, dimensions[0]-row))
                mask = rasterize([(geometry, 1)], out_shape=(int(w.height), int(w.width)),
                                 transform=first.window_transform(w), dtype='uint8') != 0
                if mask.any():
                    windows.append((col, row, w, mask))
    # Country masks consume at most one one-degree UInt8 fragment per worker.
    for entry in entries:
        frame = {'year': entry['year'], 'tiles': [], 'counts': [0]*4}
        with rasterio.open(inputs / entry['file']) as source:
            if (source.crs.to_epsg() != 4326 or source.count != 1 or
                    source.shape != tuple(entry['shape']) or
                    not np.allclose(list(source.transform)[:6], entry['transform'], rtol=0, atol=1e-10) or
                    not np.allclose(list(source.window_transform(owned))[:6], list(base)[:6], rtol=0, atol=1e-10)):
                raise ValueError('Incompatible annual native grid')
            for col, row, w, mask in windows:
                data = source.read(1, window=w, masked=True).filled(0)
                if not np.isin(data, [0, 1, 2, 3]).all():
                    raise ValueError('Undocumented source class')
                counts = np.bincount(data[mask], minlength=4)
                frame['counts'] = [a+int(b) for a,b in zip(frame['counts'], counts)]
                data[~mask] = 15
                payload = encode(data)
                digest = hashlib.sha256(payload).hexdigest()
                relative = f'tiles/{digest[:2]}/{digest}.bin.gz'
                target = output / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with ASSET_LOCK:
                    if target.exists():
                        if target.read_bytes() != payload:
                            raise ValueError('Existing immutable asset is corrupt')
                    else:
                        temporary = target.with_suffix('.part')
                        temporary.write_bytes(payload)
                        temporary.replace(target)
                result['assets'][digest] = {'url': relative, 'bytes': len(payload), 'sha256': digest}
                frame['tiles'].append({'x': col, 'y': row, 'width': int(w.width),
                                       'height': int(w.height), 'asset': digest})
        result['frames'].append(frame)
    compact_json(index_path, result)
    return result


def build(inputs, boundary, output, years=YEARS, workers=4):
    start = time.perf_counter()
    years = tuple(sorted(years))
    if not years or len(set(years)) != len(years) or any(y not in YEARS for y in years):
        raise ValueError('Expected distinct supported years')
    if type(workers) is not int or not 1 <= workers <= 8:
        raise ValueError('Expected 1–8 workers')
    audit_path, requests_path = inputs/'inputs.json', inputs/'requests.json'
    audit, requests = json.loads(audit_path.read_text()), json.loads(requests_path.read_text())
    if (not audit['complete'] or audit['missing'] or audit['sourceVersion'] != VERSION or
            audit['requestsSha256'] != sha256(requests_path) or
            audit['boundarySha256'] != sha256(boundary)):
        raise ValueError('Complete coherent national audit and pinned boundary required')
    entries = {(e['chunkId'], e['year']): e for e in audit['files']}
    expected = {(c['id'], y) for c in requests['chunks'] for y in YEARS}
    if len(entries) != len(audit['files']) or set(entries) != expected:
        raise ValueError('Audit must contain every unique national annual fragment')
    for e in entries.values():
        if (Path(e['file']).name != e['file'] or e['collection'] != collection(e['year']) or
                e['nationalClipBoundarySha256'] != audit['boundarySha256']):
            raise ValueError('Unexpected source provenance')
    country = unary_union([shape(f['geometry']) for f in json.loads(boundary.read_text())['features']])
    if country.is_empty or not country.is_valid:
        raise ValueError('Invalid country boundary')
    identity = {'processingVersion': PROCESSING_VERSION, 'builderSha256': sha256(Path(__file__)),
                'auditSha256': sha256(audit_path), 'boundarySha256': sha256(boundary), 'years': list(years)}
    output.mkdir(parents=True, exist_ok=True)
    chunks, assets = [], {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(build_chunk, c, [entries[(c['id'], y)] for y in years],
                               inputs, country, output, identity) for c in requests['chunks']]
        for future in as_completed(futures):
            result = future.result()
            index = output/'frames'/(result['id']+'.json')
            chunks.append({'id': result['id'], 'url': str(index.relative_to(output)),
                           'sha256': sha256(index), 'bytes': index.stat().st_size,
                           'transform': result['transform'], 'width': result['width'], 'height': result['height']})
            assets.update(result['assets'])
            print(f"{len(chunks)}/{len(futures)} {result['id']} ({len(result['assets'])} unique tiles)", flush=True)
    feature_bytes = sum(a['bytes'] for a in assets.values()) + sum(c['bytes'] for c in chunks)
    result = {'schemaVersion': 1, **identity, 'status': 'local-build-evidence; catalogue and publication gates pending',
              'sourceVersion': VERSION, 'attribution': requests['attribution'],
              'boundaryAttribution': requests['boundaryAttribution'], 'crs': 'EPSG:4326',
              'resampling': 'none', 'encoding': 'packed4-gzip', 'tileSize': TILE_SIZE,
              'classes': {'0': 'unobserved', '1': 'dry', '2': 'seasonal', '3': 'permanent', '15': 'outside Ukraine'},
              'ownership': 'native cell centre in half-open one-degree envelope: west <= x < east; south <= y < north',
              'chunks': sorted(chunks, key=lambda c:c['id']), 'uniqueTiles': len(assets),
              'featureBytesExcludingManifest': feature_bytes, 'completeTimeline': years == YEARS}
    compact_json(output/'national-tiles.json', result)
    metrics = {'seconds': time.perf_counter()-start, 'uniqueTiles': len(assets),
               'featureBytes': feature_bytes+(output/'national-tiles.json').stat().st_size,
               'storageGate': feature_bytes+(output/'national-tiles.json').stat().st_size <= 750_000_000,
               'completeTimeline': years == YEARS}
    write_json(output/'build-metrics.json', metrics)
    print(metrics, flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, default=ROOT/'data/raw/surface-water/national')
    parser.add_argument('--boundary', type=Path, default=ROOT.parent/'public/data/oblasts.geojson')
    parser.add_argument('--output', type=Path, default=ROOT/'data/raw/surface-water/national-tiles')
    parser.add_argument('--year', type=int, action='append', help='Bounded evidence run; omit for all 41 years')
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    build(args.inputs, args.boundary, args.output, args.year if args.year else YEARS, args.workers)
