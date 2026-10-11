"""Generate small committed catalogue evidence from a validated release.

The full immutable manifest and numerical series are deployment assets. This
small file lets ordinary CI validate real production reference records without
acquiring heavy assets or generating satellite products.
"""
import argparse
import json
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import transform
from pyproj import Transformer
from surface_water import GEOGRAPHIC_TO_AREA

from prepare_surface_water_national import sha256
from build_surface_water_national import compact_json


def marker_coordinates(geometry):
    """Place the marker inside the largest historical water polygon, including holes."""
    projected = transform(GEOGRAPHIC_TO_AREA.transform, shape(geometry))
    polygon = max(projected.geoms, key=lambda part: part.area) if projected.geom_type == "MultiPolygon" else projected
    point = polygon.representative_point()
    inverse = Transformer.from_crs(6933, 4326, always_xy=True)
    return list(inverse.transform(point.x, point.y))


def build(inputs, output):
    pointer = json.loads((inputs/'current.json').read_text())
    manifest_path = inputs/pointer['url']
    if sha256(manifest_path) != pointer['sha256']:
        raise ValueError('Selected immutable manifest changed')
    manifest = json.loads(manifest_path.read_text())
    root = manifest_path.parent
    zones_path = root/manifest['analysisZones']['url']
    if sha256(zones_path) != manifest['analysisZones']['sha256']:
        raise ValueError('Analysis zones changed')
    zones = {f['properties']['id']: f['geometry']
             for f in json.loads(zones_path.read_text())['features']}
    # The marker catalogue keeps its own schema while the manifest layout evolves.
    result = {'schemaVersion': 1, **{k: manifest[k] for k in ('version', 'processingVersion', 'zoneVersion',
              'sourceVersion', 'years', 'unit', 'areaCRS', 'areaMethod', 'attribution', 'quality', 'sources', 'registrationRisk')}}
    result['manifest'] = {k: pointer[k] for k in ('sha256', 'bytes')}
    result['manifest']['url'] = 'surface-water/'+pointer['url']
    result['nativeChunkCount'] = len(manifest['chunks'])
    result['catalogue'] = []
    for item in manifest['catalogue']:
        path = root/item['series']['url']
        if sha256(path) != item['series']['sha256']:
            raise ValueError('Series changed')
        data = json.loads(path.read_text())
        entry = {**item, 'markerCoordinates': marker_coordinates(zones[item['id']]), 'annualReference': [a for a in data['annual'] if a['year'] in {1984, 1992, 2021, 2024}],
                 'pairReference': next(p for p in data['pairs'] if p['beforeYear'] == 2021 and p['afterYear'] == 2024)}
        entry['series'] = {**item['series'], 'url': f"surface-water/versions/{manifest['version']}/"+item['series']['url']}
        result['catalogue'].append(entry)
    compact_json(output, result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parent
    parser.add_argument('--inputs', type=Path, default=root/'data/raw/surface-water/release')
    parser.add_argument('--output', type=Path, default=root.parent/'public/data/surface-water-catalogue.json')
    args = parser.parse_args()
    build(args.inputs, args.output)
