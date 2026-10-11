"""Download exact Code Editor URL manifests and retain only Ukraine classes.

No browser credentials are read. The queue contains observed, temporary Earth
Engine table URLs. Source rasters are streamed, verified, country-masked without
resampling, and atomically installed. Receipts allow checksum-verified resume.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import time
from urllib.parse import urlparse
from urllib.request import urlopen

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import Window
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

from prepare_surface_water_national import BOUNDARY_ATTRIBUTION, sha256, write_json


def allowed_url(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'earthengine.googleapis.com':
        raise ValueError('Expected observed Earth Engine download URL')
    return url


def retrieve(url, path):
    for attempt in range(3):
        try:
            with urlopen(allowed_url(url), timeout=120) as response, path.open('wb') as target:
                for block in iter(lambda: response.read(1024 * 1024), b''):
                    target.write(block)
            return
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def mask_country(raw, staged, p, country):
    """Retain exact native classes only at pixel centres within Ukraine."""
    native = np.asarray(json.loads(p['nativeTransform']))
    with rasterio.open(raw) as src:
        if src.crs != rasterio.crs.CRS.from_epsg(4326) or src.count != 1 or src.dtypes != ('uint8',):
            raise ValueError('Unexpected exact annual source header')
        t = np.asarray(list(src.transform)[:6])
        if (not np.allclose(t[[0, 1, 3, 4]], native[[0, 1, 3, 4]], rtol=0, atol=1e-15) or
                any(abs(v - round(v)) > 1e-7 for v in
                    ((t[2] - native[2]) / native[0], (t[5] - native[5]) / native[4]))):
            raise ValueError('Download changed the native grid')
        west, south, east, north = json.loads(p['downloadEnvelope'])
        b = src.bounds
        if not (b.left <= west and b.bottom <= south and b.right >= east and b.top >= north):
            raise ValueError('Download clips its national fragment')
        clipped = country.intersection(box(*b))
        if clipped.is_empty:
            raise ValueError('National fragment does not intersect Ukraine')
        geometry = mapping(clipped)
        profile = src.profile.copy()
        profile.update(driver='GTiff', nodata=0, compress='deflate', tiled=True,
                       blockxsize=512, blockysize=512)
        counts = np.zeros(4, dtype=np.int64)
        with rasterio.open(staged, 'w', **profile) as dst:
            for row in range(0, src.height, 512):
                for col in range(0, src.width, 512):
                    w = Window(col, row, min(512, src.width-col), min(512, src.height-row))
                    data = src.read(1, window=w, masked=True).filled(0)
                    if not np.isin(data, [0, 1, 2, 3]).all():
                        raise ValueError('Unexpected yearly class')
                    inside = rasterize([(geometry, 1)], out_shape=data.shape,
                                       transform=src.window_transform(w), dtype='uint8')
                    data[inside == 0] = 0
                    counts += np.bincount(data.ravel(), minlength=4)
                    dst.write(data, 1, window=w)
    return counts


def download(entry, output, country, boundary_sha):
    p = entry['properties']
    filename = p['file']
    if Path(filename).name != filename:
        raise ValueError('Unsafe source filename')
    target = output / filename
    receipt_path = output / 'receipts' / (p['id'] + '.json')
    if receipt_path.exists() and target.exists():
        receipt = json.loads(receipt_path.read_text())
        if receipt['boundarySha256'] == boundary_sha and sha256(target) == receipt['sha256']:
            return receipt
    raw = target.with_suffix('.download.part')
    staged = target.with_suffix('.masked.part')
    retrieve(p['downloadUrl'], raw)
    original_sha = sha256(raw)
    counts = mask_country(raw, staged, p, country)
    receipt = {'id': p['id'], 'file': filename, 'year': p['year'],
               'boundarySha256': boundary_sha, 'rawSha256': original_sha,
               'sha256': sha256(staged), 'bytes': staged.stat().st_size,
               'values': counts.tolist(), 'outsideCountry': 'class 0; native pixel-centre mask',
               'resampling': 'none'}
    staged.replace(target)
    write_json(receipt_path, receipt)
    raw.unlink()
    return receipt


def fetch_manifest(url, year, output, requests, country, boundary_sha, workers):
    temporary = output / f'manifest-{year}.part'
    retrieve(url, temporary)
    document = json.loads(temporary.read_text())
    expected = {j['id']: j for j in requests['jobs'] if j['year'] == year}
    features = document['features']
    ids = [f['properties']['id'] for f in features]
    if len(ids) != len(set(ids)) or set(ids) != set(expected):
        raise ValueError('Manifest must contain every unique national fragment for this year')
    for f in features:
        p = f['properties']
        job = expected[p['id']]
        if (any(p[k] != job[k] for k in ('chunkId', 'year', 'file', 'collection')) or
                json.loads(p['downloadEnvelope']) != job['downloadEnvelope'] or
                p['band'] != 'waterClass' or p['missingClass'] != 0):
            raise ValueError('Unexpected national manifest provenance')
        allowed_url(p['downloadUrl'])
    # Keep the pristine URL manifest separate from augmented local provenance.
    temporary.replace(output / f'urls-{year}.geojson')
    for f in features:
        f['properties']['nationalClipBoundarySha256'] = boundary_sha
        f['properties']['nationalClipAttribution'] = BOUNDARY_ATTRIBUTION
    write_json(output / f'provenance-direct-{year}.geojson', document)
    receipts = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(download, f, output, country, boundary_sha) for f in features]
        for future in as_completed(futures):
            receipts.append(future.result())
            if len(receipts) % 25 == 0:
                print(f'{year}: {len(receipts)}/{len(features)} downloaded', flush=True)
    print(f"YEAR COMPLETE {year}: {len(receipts)} files, {sum(r['bytes'] for r in receipts)} bytes", flush=True)


def run(queue, output, boundary, workers):
    requests = json.loads((output / 'requests.json').read_text())
    boundary_sha = sha256(boundary)
    if requests['boundarySha256'] != boundary_sha:
        raise ValueError('Boundary differs from pinned national coverage')
    country = unary_union([shape(f['geometry']) for f in json.loads(boundary.read_text())['features']])
    completed = set()
    while len(completed) < 41:
        entries = json.loads(queue.read_text()) if queue.exists() else []
        pending = [e for e in entries if e['year'] not in completed]
        if not pending:
            time.sleep(2)
            continue
        for entry in pending:
            fetch_manifest(entry['url'], entry['year'], output, requests, country, boundary_sha, workers)
            completed.add(entry['year'])
            print(f'PROGRESS {len(completed)}/41 years', flush=True)
    print('ALL NATIONAL DOWNLOADS COMPLETE', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--queue', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--boundary', type=Path, default=Path('public/data/oblasts.geojson'))
    parser.add_argument('--workers', type=int, choices=range(1, 17), default=8)
    args = parser.parse_args()
    run(args.queue, args.output, args.boundary, args.workers)
