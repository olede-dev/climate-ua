"""Pin the pre-2023 OSM Kremenchuk identity constraint, not annual water classes.

Downloads a historical relation with metadata and polygonizes member ways.
The derived constraint retains ODbL attribution; raw sources stay gitignored.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

from shapely.geometry import LineString, mapping
from shapely.ops import polygonize, unary_union

SNAPSHOT = '2022-12-31T23:59:59Z'
QUERY = f'[out:json][timeout:90][date:"{SNAPSHOT}"];relation(2289192);out meta geom;'
ENDPOINT = 'https://overpass-api.de/api/interpreter'


def fetch(output, refresh=False):
    output.parent.mkdir(parents=True, exist_ok=True)
    raw = output.with_suffix('.json')
    if refresh or not raw.exists():
        req = Request(ENDPOINT, data=urlencode({'data': QUERY}).encode(),
                      headers={'User-Agent': 'climate-ua-source-audit/1.0'})
        with urlopen(req, timeout=120) as response:
            content = response.read()
        parsed = json.loads(content)
        if len(parsed['elements']) != 1:
            raise ValueError('Expected exactly the pinned relation')
        raw.write_bytes(content)
    source = json.loads(raw.read_text())['elements'][0]
    if source['type'] != 'relation' or source['id'] != 2289192 or source['tags']['wikidata'] != 'Q1431500':
        raise ValueError('Wrong reservoir identity')
    if 'timestamp' not in source or source['timestamp'] > SNAPSHOT:
        raise ValueError('Historical relation metadata is missing or later than snapshot; refresh input')
    lines = {'outer': [], 'inner': []}
    for member in source['members']:
        if member['type'] == 'way' and member['role'] in lines:
            points = [(p['lon'], p['lat']) for p in member['geometry']]
            lines[member['role']].append(LineString(points))
    polygon = unary_union(list(polygonize(lines['outer']))).difference(unary_union(list(polygonize(lines['inner']))))
    if polygon.is_empty or not polygon.is_valid:
        raise ValueError('Cannot reconstruct valid historical identity boundary')
    props = {'name': source['tags']['name'], 'osmRelation': 2289192,
             'snapshot': SNAPSHOT, 'relationTimestamp': source['timestamp'],
             'relationVersion': source['version'], 'licence': 'ODbL-1.0',
             'attribution': '© OpenStreetMap contributors',
             'source': 'https://www.openstreetmap.org/relation/2289192',
             'query': QUERY, 'endpoint': ENDPOINT,
             'rawSha256': hashlib.sha256(raw.read_bytes()).hexdigest()}
    output.write_text(json.dumps({'type': 'Feature', 'properties': props,
                                 'geometry': mapping(polygon)}, ensure_ascii=False)+'\n')
    print('Pinned historical identity:', props['relationVersion'], props['relationTimestamp'], polygon.bounds)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent / 'data/raw/surface-water/kremenchuk-osm-pinned.geojson')
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    fetch(args.output, args.refresh)
