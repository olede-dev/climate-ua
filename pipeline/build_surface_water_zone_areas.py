"""Exact native-cell accounting inside a fixed, grid-aligned historical zone.

Area is from EPSG:6933 cell edges, never 900 m². The selected zone is a union of
whole native cells, so no fractional approximation is needed. Legacy and exact
export sources cannot mix; grid roundoff tolerance is 1e-10 geographic degrees.
"""
from itertools import combinations
import argparse
import hashlib
import json
from pathlib import Path
import time
from contextlib import ExitStack

import numpy as np
import rasterio
from rasterio.windows import Window

from surface_water import GEOGRAPHIC_TO_AREA, annual_areas, compare_areas

ROOT = Path(__file__).resolve().parent


def build(inputs, zones, output):
    manifest = json.loads((inputs / 'inputs.json').read_text())
    registry = json.loads(zones.read_text())
    result = {'purpose': 'Fixed historical prototype-zone areas, not national catalogue',
              'attribution': registry['attribution'], 'unit': 'm2', 'areaCRS': 'EPSG:6933',
              'method': 'Exact whole-cell intersections of grid-aligned historical zone; no class resampling',
              'zoneVersion': registry['zoneVersion'], 'zoneStatus': registry['status'], 'bodies': []}
    if any('weightsFile' in f['properties'] for f in registry['features']):
        result['purpose'] = 'Fixed full-history catalogue-zone annual and common-mask pair areas'
        result['method'] = 'Exact native-cell intersections in EPSG:6933, including fractional country edges; no class resampling'
    times = []
    for feature in registry['features']:
        props = feature['properties']
        entries = sorted((e for e in manifest['files'] if e['waterbodyId'] == props['id'] and
                          e['product'] in ('yearly', 'YearlyHistory')), key=lambda e:e['year'])
        if not entries:
            raise ValueError('Missing yearly body sources')
        if len({e['product'] for e in entries}) != 1:
            raise ValueError('Cannot mix archive and exact annual distributions')
        if len({e['year'] for e in entries}) != len(entries):
            raise ValueError('Duplicate annual year')
        mask_path = zones.parent / props['maskFile']
        if hashlib.sha256(mask_path.read_bytes()).hexdigest() != props['maskSha256']:
            raise ValueError('Zone mask checksum changed')
        arrays = {}
        start = time.perf_counter()
        with ExitStack() as stack:
            mask = stack.enter_context(rasterio.open(mask_path))
            weights_source = None
            if 'weightsFile' in props:
                weights_path = zones.parent / props['weightsFile']
                if hashlib.sha256(weights_path.read_bytes()).hexdigest() != props['weightsSha256']:
                    raise ValueError('Zone intersection weights checksum changed')
                weights_source = stack.enter_context(rasterio.open(weights_path))
                if (weights_source.crs != mask.crs or weights_source.shape != mask.shape or
                        weights_source.transform != mask.transform):
                    raise ValueError('Zone weights grid differs from fixed zone')
            for entry in entries:
                path = inputs / entry['file']
                if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
                    raise ValueError('Annual source checksum changed')
                with rasterio.open(path) as r:
                    if (r.crs != mask.crs or r.shape != mask.shape or r.count != 1 or
                        not np.allclose(list(r.transform),list(mask.transform),rtol=0,atol=1e-10)):
                        raise ValueError('Annual source grid differs from fixed zone')
                arrays[entry['year']] = path
            readers = {year: stack.enter_context(rasterio.open(path)) for year, path in arrays.items()}
            annual = {y:np.zeros(4) for y in arrays}
            pairs = {p:np.zeros(16) for p in combinations(arrays,2)}
            # One bounded strip of cells at a time. Every pair reuses the same
            # canonical native weights and the two valid-class masks.
            for row in range(0, mask.height, 64):
                w = Window(0, row, mask.width, min(64, mask.height-row))
                inside = mask.read(1, window=w) != 0
                if not inside.any():
                    continue
                t = mask.transform
                lats = t.f + (row + np.arange(int(w.height)+1))*t.e
                _, ys = GEOGRAPHIC_TO_AREA.transform(np.zeros_like(lats), lats)
                x0, _ = GEOGRAPHIC_TO_AREA.transform(t.c,0)
                x1, _ = GEOGRAPHIC_TO_AREA.transform(t.c+t.a,0)
                weights = np.broadcast_to((ys[:-1]-ys[1:])[:,None]*(x1-x0),inside.shape)[inside]
                if weights_source is not None:
                    weights = weights_source.read(1, window=w)[inside]
                    if not np.isfinite(weights).all() or (weights < 0).any():
                        raise ValueError('Invalid exact zone intersection weights')
                classes = {}
                for year, path in arrays.items():
                    data = readers[year].read(1,window=w,masked=True).filled(0)[inside]
                    if not np.isin(data,[0,1,2,3]).all():
                        raise ValueError('Undocumented class inside historical zone')
                    classes[year] = data.astype(np.int64)
                    annual[year] += np.bincount(classes[year],weights=weights,minlength=4)
                for (a,b), totals in pairs.items():
                    totals += np.bincount(classes[a]*4+classes[b],weights=weights,minlength=16)
        body = {'id':props['id'], 'sources':entries, 'annual':[], 'pairs':[]}
        for year, totals in annual.items():
            body['annual'].append({'year':year, **annual_areas(np.arange(4), totals)})
        for (a,b),totals in pairs.items():
            body['pairs'].append({'beforeYear':a,'afterYear':b,
                **compare_areas(np.repeat(np.arange(4),4),np.tile(np.arange(4),4),totals)})
        if abs(body['annual'][0]['zoneM2'] - props['zoneM2']) > max(1e-5, props['zoneM2'] * 1e-9):
            raise ValueError('Zone mask weights differ from independently projected polygon area')
        result['bodies'].append(body)
        times.append({'body':props['id'],'seconds':time.perf_counter()-start})
        print(props['id'],[(a['year'],round(a['coverage'],4)) for a in body['annual']],flush=True)
    output.parent.mkdir(parents=True,exist_ok=True)
    tmp = output.with_suffix('.part')
    tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n');tmp.replace(output)
    print(times)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs',type=Path,default=ROOT/'data/raw/surface-water/earth-engine')
    parser.add_argument('--zones',type=Path,default=ROOT/'data/raw/surface-water/prototype/candidate-zones.geojson')
    parser.add_argument('--output',type=Path,default=ROOT/'data/raw/surface-water/prototype/zone-areas.json')
    args=parser.parse_args();build(args.inputs,args.zones,args.output)
