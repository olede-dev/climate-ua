"""Pin historical OSM identity constraints with bounded, resumable requests.

Fetch relation metadata separately from small geometry batches. These are
identity constraints, never annual-water classification or approved zones.
"""
import argparse
import json
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from shapely.geometry import LineString, mapping
from shapely.ops import polygonize_full, unary_union

from prepare_surface_water_national import sha256, write_json

SNAPSHOT = '2022-12-31T23:59:59Z'
ENDPOINT = 'https://overpass-api.de/api/interpreter'
ENDPOINTS = (ENDPOINT, 'https://overpass.private.coffee/api/interpreter')
MAX_WAYS = 8


class SourceUnavailable(RuntimeError):
    """All bounded attempts failed; existing cached sources remain usable."""

    def __init__(self, message, *, splittable=True):
        super().__init__(message)
        self.splittable = splittable


IDENTITIES = {
    'kyiv': (1605938, 'Q1425651'),
    'kaniv': (3173129, 'Q1551994'),
    'kremenchuk': (2289192, 'Q1431500'),
    'kamianske': (287177, 'Q1232983'),
    'dnister': (2263062, 'Q12101431'),
    'svitiaz': (2764724, 'Q1265476'),
    'yalpuh': (5503202, 'Q2330113'),
    'kuhurlui': (11543925, 'Q2392979'),
    'donuzlav': (9505344, 'Q4166460'),
}


def query(selector):
    return f'[out:json][timeout:25][date:"{SNAPSHOT}"];{selector}'


def download(selector, path, endpoint, *, opener=urlopen, pause=time.sleep):
    if not path.exists():
        failures = []
        splittable, rate_limited = False, False
        endpoints = (endpoint,) + tuple(e for e in ENDPOINTS if e != endpoint)
        for attempt in range(2):
            for server in endpoints:
                request = Request(server, data=urlencode({'data': query(selector)}).encode(),
                                  headers={'User-Agent': 'climate-ua-source-audit/1.0'})
                try:
                    with opener(request, timeout=45) as response:
                        value = json.loads(response.read())
                    if value.get('remark'):
                        remark = value['remark']
                        if 'timed out' in remark.lower() or 'out of memory' in remark.lower():
                            raise SourceUnavailable(remark)
                        raise ValueError('Overpass failed: '+remark)
                    if not isinstance(value.get('elements'), list):
                        raise ValueError('Missing Overpass elements')
                except HTTPError as error:
                    if error.code not in {406, 429, 500, 502, 503, 504}:
                        raise
                    failures.append(f'{server}: HTTP {error.code}')
                    print(failures[-1], flush=True)
                    splittable |= error.code == 504
                    error.close()
                    if error.code in {406, 429}:
                        rate_limited = True
                        # Respect the public instance's documented cooldown.
                        pause(30)
                    continue
                except (URLError, TimeoutError, SourceUnavailable) as error:
                    failures.append(f'{server}: {error}')
                    print(failures[-1], flush=True)
                    splittable |= (isinstance(error, (TimeoutError, SourceUnavailable)) or
                                   isinstance(getattr(error, 'reason', None), TimeoutError))
                    continue
                # Failed or malformed responses never become resumable inputs.
                write_json(path, {'query': query(selector), 'endpoint': server, 'response': value})
                break
            else:
                if attempt == 0:
                    print('Historical request unavailable; retrying after 30 s', flush=True)
                    pause(30)
                    continue
                raise SourceUnavailable('; '.join(failures), splittable=splittable and not rate_limited)
            break
    cached = json.loads(path.read_text())
    if cached['query'] != query(selector):
        raise ValueError('Cached historical query differs; use a new output directory')
    if cached['response'].get('remark'):
        raise ValueError('Cached Overpass response is incomplete')
    return cached['response']['elements']


def download_ways(batch, path, endpoint, *, downloader=download):
    """Split timed-out batches, preserving each completed child for resume."""
    children = (path.with_name(path.stem+'-a.json'), path.with_name(path.stem+'-b.json'))
    split = (len(batch) > MAX_WAYS or any(path.parent.glob(path.stem+'-[ab]*.json'))) and not path.exists()
    if not split:
        try:
            data = downloader('way(id:'+','.join(map(str, batch))+');out geom;', path, endpoint)
        except SourceUnavailable as error:
            if len(batch) == 1 or not error.splittable:
                raise
            split = True
        else:
            if (len(data) != len(batch) or {e['id'] for e in data} != set(batch) or
                    any(e['type'] != 'way' for e in data)):
                raise ValueError('Incomplete historical way batch')
            return data, [{'file': path.name, 'sha256': sha256(path)}]
    middle = len(batch)//2
    data, sources = [], []
    for group, child in zip((batch[:middle], batch[middle:]), children):
        items, records = download_ways(group, child, endpoint, downloader=downloader)
        data.extend(items)
        sources.extend(records)
    return data, sources


def boundary(relation, ways):
    lines = {'outer': [], 'inner': []}
    required = [m for m in relation['members'] if m['type'] == 'way' and m['role'] in lines]
    if not required or len({m['ref'] for m in required}) != len(required):
        raise ValueError('Missing or duplicate relation boundary ways')
    if any(m['type'] == 'relation' for m in relation['members']):
        raise ValueError('Nested relations need explicit reconstruction')
    if set(ways) != {m['ref'] for m in required}:
        raise ValueError('Historical geometry must contain every required way exactly once')
    for member in required:
        item = ways[member['ref']]
        if item['type'] != 'way' or not item.get('geometry'):
            raise ValueError('Missing historical way geometry')
        line = LineString([(p['lon'], p['lat']) for p in item['geometry']])
        if line.is_empty or not line.is_valid:
            raise ValueError('Invalid boundary way')
        lines[member['role']].append(line)
    rings = {}
    for role, parts in lines.items():
        if not parts:
            rings[role] = unary_union([])
            continue
        polygons, cuts, dangles, invalid = polygonize_full(parts)
        if not cuts.is_empty or not dangles.is_empty or not invalid.is_empty:
            raise ValueError('Historical boundary has incomplete or invalid rings')
        rings[role] = unary_union(polygons)
    if not rings['inner'].is_empty and not rings['outer'].covers(rings['inner']):
        raise ValueError('Historical inner ring lies outside outer boundary')
    polygon = rings['outer'].difference(rings['inner'])
    if polygon.is_empty or not polygon.is_valid or polygon.geom_type not in {'Polygon', 'MultiPolygon'}:
        raise ValueError('Invalid historical identity polygon')
    return polygon


def fetch(output, bodies, endpoint=ENDPOINT):
    if endpoint not in ENDPOINTS:
        raise ValueError('Expected documented public Overpass endpoint')
    for body in bodies:
        relation_id, wikidata = IDENTITIES[body]
        folder = output/body
        metadata_path = folder/'relation.json'
        elements = download(f'relation({relation_id});out meta;', metadata_path, endpoint)
        if len(elements) != 1:
            raise ValueError(f'Missing unique historical identity: {body}')
        relation = elements[0]
        if (relation['type'] != 'relation' or relation['id'] != relation_id or
                relation['tags'].get('wikidata') != wikidata or
                not relation.get('timestamp') or relation['timestamp'] > SNAPSHOT or
                relation['tags'].get('natural') != 'water'):
            raise ValueError(f'Unexpected historical identity metadata: {body}')
        refs = list(dict.fromkeys(m['ref'] for m in relation['members'] if m['type'] == 'way' and
                                  m['role'] in {'outer', 'inner'}))
        ways, sources = {}, [{'file': 'relation.json', 'sha256': sha256(metadata_path)}]
        for offset in range(0, len(refs), 100):
            group = refs[offset:offset+100]
            legacy = folder/f'ways-{offset}.json'
            segments = [(group, legacy)] if legacy.exists() else [
                (group[start:start+25], folder/f'ways-{offset}-{start}.json')
                for start in range(0, len(group), 25)]
            for batch, path in segments:
                data, records = download_ways(batch, path, endpoint)
                ways.update({e['id']: e for e in data})
                sources.extend(records)
                print(body, f'{len(ways)}/{len(refs)} historical ways', flush=True)
        polygon = boundary(relation, ways)
        properties = {'id': body, 'nameUk': relation['tags'].get('name:uk', relation['tags']['name']),
                      'nameEn': relation['tags'].get('name:en'), 'snapshot': SNAPSHOT,
                      'relationId': relation_id, 'relationVersion': relation['version'],
                      'relationTimestamp': relation['timestamp'], 'wikidata': wikidata,
                      'licence': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
                      'source': f'https://www.openstreetmap.org/relation/{relation_id}',
                      'role': 'Historical identity constraint; not annual water or approved analysis zone',
                      'sources': sources}
        write_json(folder/'identity.geojson', {'type': 'Feature', 'properties': properties,
                                              'geometry': mapping(polygon)})
        print(body, 'pinned historical identity', polygon.bounds, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent/'data/raw/surface-water/catalogue-identities')
    parser.add_argument('--body', choices=sorted(IDENTITIES), action='append')
    parser.add_argument('--endpoint', default=ENDPOINT)
    args = parser.parse_args()
    try:
        fetch(args.output, args.body if args.body else list(IDENTITIES), args.endpoint)
    except SourceUnavailable as error:
        parser.exit(1, f'Historical source unavailable; cached progress preserved in {args.output}.\n{error}\n')
