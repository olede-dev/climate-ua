"""Render full-history, identity and selected-zone overlays for human/agent QA."""
import argparse
import html
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from shapely.geometry import shape

from prepare_surface_water_national import sha256, write_json


def render(zones, identities):
    registry = json.loads(zones.read_text())
    output = zones.parent/'review'
    output.mkdir(exist_ok=True)
    panels, metrics = [], []
    for feature in registry['features']:
        p, body = feature['properties'], feature['properties']['id']
        with rasterio.open(zones.parent/p['maskFile']) as mask:
            selected = mask.read(1) != 0
            transform = mask.transform
            scale = min(1., 1100/mask.width, 700/mask.height)
            dims = (max(1, round(mask.height*scale)), max(1, round(mask.width*scale)))
        union = np.zeros(selected.shape, dtype=bool)
        for entry in p['classificationSources']:
            with rasterio.open(zones.parent/'annual-inputs'/entry['file']) as src:
                union |= src.read(1, masked=True).filled(0) >= 2
        # Rasterio decimates solely this QA illustration, never input classes.
        rgb = np.full((3, *selected.shape), 245, dtype='uint8')
        rgb[:, union] = np.array([130, 182, 210])[:, None]
        rgb[:, selected] = np.array([200, 70, 110])[:, None]
        with rasterio.io.MemoryFile() as memory:
            with memory.open(driver='GTiff', width=selected.shape[1], height=selected.shape[0],
                             count=3, dtype='uint8') as dst:
                dst.write(rgb)
                reduced = dst.read(out_shape=(3, *dims), resampling=Resampling.nearest)
        image = output/(body+'.png')
        with rasterio.open(image, 'w', driver='PNG', width=dims[1], height=dims[0], count=3, dtype='uint8') as dst:
            dst.write(reduced)
        identity = shape(json.loads((identities/body/'identity.geojson').read_text())['geometry'])
        rings = []
        for polygon in ([identity] if identity.geom_type == 'Polygon' else identity.geoms):
            for ring in [polygon.exterior, *polygon.interiors]:
                coords = [((x-transform.c)/transform.a*dims[1]/selected.shape[1],
                           (y-transform.f)/transform.e*dims[0]/selected.shape[0]) for x, y in ring.coords]
                rings.append('M'+' L'.join(f'{x:.2f},{y:.2f}' for x, y in coords)+' Z')
        svg = f'<svg viewBox="0 0 {dims[1]} {dims[0]}" width="100%"><image href="{image.name}" width="{dims[1]}" height="{dims[0]}"/><path d="{" ".join(rings)}" fill="none" stroke="#176d2a" stroke-width="1"/></svg>'
        panels.append(f'<section id="{body}"><h2>{html.escape(p["nameEn"])}</h2><p>{p["zoneM2"]/1e6:.3f} km² · {p["historicalPixels"]:,} cells · overlap removed {p["overlapRemovedPixels"]:,}</p>{svg}</section>')
        metrics.append({'id': body, 'image': image.name, 'imageSha256': sha256(image),
                        'identityBounds': list(identity.bounds), 'zoneBounds': list(shape(feature['geometry']).bounds),
                        'zoneM2': p['zoneM2'], 'countryClippedM2': p['countryClippedM2'],
                        'overlapRemovedPixels': p['overlapRemovedPixels']})
    (output/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Full-history zone review</title><style>body{font:16px system-ui;margin:20px}section{border:1px solid #ccc;padding:10px;margin:12px 0;max-width:1100px}svg{max-height:650px}</style><h1>1984–2022 native water union</h1><p>Pink: selected fixed zone. Blue: other observed water in the complete crop. Green: pinned end-2022 identity. Check upstream extent, shore expansion, islands, neighbouring waters and overlap ownership.</p>'+''.join(panels))
    write_json(output/'metrics.json', {'zonesSha256': sha256(zones), 'bodies': metrics})
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parent
    parser.add_argument('--zones', type=Path, default=root/'data/raw/surface-water/catalogue-full-history/analysis-zones.geojson')
    parser.add_argument('--identities', type=Path, default=root/'data/raw/surface-water/catalogue-archive-identities')
    args = parser.parse_args()
    render(args.zones, args.identities)
