"""Bounded one-cell registration sensitivity; never corrects source registration.

Shift the later annual raster by each neighbour offset. This is a diagnostic
scenario, not an error bar: JRC reports spatially varying offsets above one cell.
"""
import argparse
import json
from contextlib import ExitStack
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

from surface_water import GEOGRAPHIC_TO_AREA, compare_areas


def check(inputs, zones, output):
    registry = json.loads(zones.read_text())
    result = {'zoneVersion': registry['zoneVersion'],
              'method': 'Later raster shifted by integer native cells; no resampling',
              'limitation': 'Scenario sensitivity, not uncertainty bounds or registration correction',
              'bodies': []}
    for feature in registry['features']:
        p = feature['properties']
        body = {'id': p['id'], 'pairs': []}
        with ExitStack() as stack:
            mask = stack.enter_context(rasterio.open(zones.parent / p['maskFile']))
            weight_source = stack.enter_context(rasterio.open(zones.parent/p['weightsFile'])) if 'weightsFile' in p else None
            for a, b in [(2021, 2022), (2022, 2024)]:
                scenarios = []
                with rasterio.open(inputs / f"{p['id']}-yearly-{a}.tif") as before, rasterio.open(inputs / f"{p['id']}-yearly-{b}.tif") as after:
                    if before.shape != mask.shape or after.shape != mask.shape:
                        raise ValueError('Registration diagnostic needs audited matching grids')
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            totals = np.zeros(16)
                            for row in range(0, mask.height, 64):
                                w = Window(0, row, mask.width, min(64, mask.height-row))
                                inside = mask.read(1, window=w) != 0
                                if not inside.any():
                                    continue
                                x = before.read(1, window=w, masked=True).filled(0)[inside].astype(np.int64)
                                shifted = Window(dx, row+dy, w.width, w.height)
                                y = after.read(1, window=shifted, boundless=True, masked=True).filled(0)[inside].astype(np.int64)
                                if not np.isin(x, [0, 1, 2, 3]).all() or not np.isin(y, [0, 1, 2, 3]).all():
                                    raise ValueError('Unexpected annual class')
                                t = mask.transform
                                lats = t.f+(row+np.arange(int(w.height)+1))*t.e
                                _, ys = GEOGRAPHIC_TO_AREA.transform(np.zeros_like(lats), lats)
                                x0, _ = GEOGRAPHIC_TO_AREA.transform(t.c, 0)
                                x1, _ = GEOGRAPHIC_TO_AREA.transform(t.c+t.a, 0)
                                weights = np.broadcast_to((ys[:-1]-ys[1:])[:, None]*(x1-x0), inside.shape)[inside]
                                if weight_source is not None:
                                    weights = weight_source.read(1, window=w)[inside]
                                totals += np.bincount(x*4+y, weights=weights, minlength=16)
                            scenarios.append({'dx': dx, 'dy': dy, **compare_areas(np.repeat(np.arange(4), 4), np.tile(np.arange(4), 4), totals)})
                body['pairs'].append({'beforeYear': a, 'afterYear': b, 'scenarios': scenarios})
        result['bodies'].append(body)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, required=True)
    parser.add_argument('--zones', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    check(args.inputs, args.zones, args.output)
