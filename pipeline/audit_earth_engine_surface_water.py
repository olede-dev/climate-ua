"""Audit immutable exact YearlyHistory exports before prototype processing."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parent
COLLECTIONS = {
    1984: 'JRC/GSW1_4/YearlyHistory', 2015: 'JRC/GSW1_4/YearlyHistory',
    2016: 'projects/global-surface-water/assets/GSW1_5/YearlyHistory_2016_2021',
    2021: 'projects/global-surface-water/assets/GSW1_5/YearlyHistory_2016_2021',
    **{y: 'projects/global-surface-water/assets/GSW1_5/YearlyHistory_2022_2024' for y in (2022, 2023, 2024)},
}


def audit(inputs, output):
    source = json.loads((inputs / 'yearly-source-provenance.geojson').read_text())
    expected = {(b, y) for b in ('kakhovka', 'kremenchuk', 'svitiaz') for y in COLLECTIONS}
    keys = [(f['properties']['waterbodyId'], f['properties']['year']) for f in source['features']]
    if len(keys) != len(expected) or set(keys) != expected:
        raise ValueError('Provenance must contain the unique 21 expected body/year entries')
    result = {'purpose': 'Exact JRC export integrity and grid audit; not source content-registration validation',
              'attribution': 'Source: EC JRC/Google', 'files': [], 'missing': []}
    grids = {}
    for feature in sorted(source['features'], key=lambda f: (f['properties']['waterbodyId'], f['properties']['year'])):
        p = feature['properties']
        filename = p['waterbodyId'] + '-yearly-' + str(p['year']) + '.tif'
        if p['file'] != filename or p['collection'] != COLLECTIONS[p['year']] or p['band'] != 'waterClass':
            raise ValueError('Unexpected source product or export filename')
        path = inputs / filename
        if not path.exists():
            result['missing'].append(filename)
            continue
        native = json.loads(p['nativeTransform'])
        with rasterio.open(path) as r:
            if r.crs.to_string() != p['crs'] or p['crs'] != 'EPSG:4326' or r.count != 1 or r.dtypes != ('uint8',):
                raise ValueError('Unexpected source raster header')
            t = list(r.transform)[:6]
            if (not np.allclose([t[0], t[1], t[3], t[4]], [native[0], native[1], native[3], native[4]], rtol=0, atol=1e-15)
                    or abs((t[2] - native[2]) / native[0] - round((t[2] - native[2]) / native[0])) > 1e-7
                    or abs((t[5] - native[5]) / native[4] - round((t[5] - native[5]) / native[4])) > 1e-7):
                raise ValueError('Export does not preserve the documented native grid')
            counts = np.zeros(4, dtype=np.int64)
            for _, w in r.block_windows(1):
                data = r.read(1, window=w)
                if not np.isin(data, [0, 1, 2, 3]).all():
                    raise ValueError('Undocumented yearly class')
                counts += np.bincount(data.ravel(), minlength=4)
            grid = grids.setdefault(p['waterbodyId'], (r.shape, t))
            if grid[0] != r.shape or not np.allclose(grid[1], t, rtol=0, atol=1e-10):
                raise ValueError('Different native grids within a waterbody')
            entry = {**p, 'product': 'YearlyHistory', 'shape': list(r.shape), 'transform': t,
                     'values': {str(c): int(n) for c, n in enumerate(counts)}, 'bytes': path.stat().st_size,
                     'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                     'gridRoundoffToleranceDegrees': 1e-10}
        result['files'].append(entry)
    result['complete'] = not result['missing']
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix('.part')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    temp.replace(output)
    print(f"Audited {len(result['files'])}/21 exact exports; {len(result['missing'])} missing")
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, default=ROOT / 'data/raw/surface-water/earth-engine')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/raw/surface-water/earth-engine/inputs.json')
    args = parser.parse_args()
    audit(args.inputs, args.output)
