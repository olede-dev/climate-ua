"""Reconstruct pinned historical identities from a later regional OSM archive.

Unchanged archive objects supply the exact snapshot state. Changed or missing
objects require their OSM API history, including node histories independently
of way versions. Outputs are local identity constraints, not approved zones.
"""
import argparse
import hashlib
import json
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import osmium
from shapely.geometry import mapping

from fetch_surface_water_catalogue import IDENTITIES, SNAPSHOT, boundary
from prepare_surface_water_national import sha256, write_json

ARCHIVE_URL = 'https://download.geofabrik.de/europe/ukraine-230101.osm.pbf'
ARCHIVE_TIMESTAMP = '2023-01-01T21:21:53Z'
ARCHIVE_BYTES = 722681087
REGISTRY = {**IDENTITIES, 'kakhovka': (1600087, 'Q1540436'),
            'dnipro': (49303, 'Q2381584')}
API = 'https://api.openstreetmap.org/api/0.6'


def payload_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def history(kind, identifier, output, *, offline=False, opener=urlopen, pause=time.sleep):
    url = f'{API}/{kind}/{identifier}/history.json'
    path = output/'history'/f'{kind}-{identifier}.json'
    if not path.exists():
        if offline:
            raise ValueError(f'Missing cached historical input: {path}')
        for attempt in range(3):
            try:
                request = Request(url, headers={'User-Agent': 'climate-ua-source-audit/1.0'})
                with opener(request, timeout=45) as response:
                    value = json.loads(response.read())
                select_history(value, kind, identifier)
                write_json(path, {'url': url, 'response': value, 'responseSha256': payload_hash(value)})
                print('Cached OSM history', kind, identifier, flush=True)
                break
            except HTTPError as error:
                if error.code not in {429, 500, 502, 503, 504} or attempt == 2:
                    raise
                error.close()
                pause(30)
            except (URLError, TimeoutError):
                if attempt == 2:
                    raise
                pause(30)
    cached = json.loads(path.read_text())
    if cached['url'] != url or payload_hash(cached['response']) != cached['responseSha256']:
        raise ValueError('Cached OSM history checksum or identity changed')
    select_history(cached['response'], kind, identifier)
    return cached['response'], {'file': str(path.relative_to(output)), 'sha256': sha256(path)}


def select_history(value, kind, identifier):
    elements = value.get('elements', [])
    if (not elements or any(e.get('type') != kind or e.get('id') != identifier or
                            not e.get('timestamp') or not e.get('version') for e in elements) or
            len({e['version'] for e in elements}) != len(elements)):
        raise ValueError('Incomplete or wrong OSM history identity')
    candidates = [e for e in elements if e['timestamp'] <= SNAPSHOT]
    if not candidates:
        raise ValueError('Object did not exist at historical snapshot')
    selected = max(candidates, key=lambda e: (e['timestamp'], e['version']))
    if not selected.get('visible', True):
        raise ValueError('Object was deleted at historical snapshot')
    return selected


def snapshot_objects(kind, identifiers, archive_objects, output, sources, *, offline=False):
    result = {}
    for identifier in sorted(identifiers):
        item = archive_objects.get(identifier)
        if item is None or item['timestamp'] > SNAPSHOT:
            value, source = history(kind, identifier, output, offline=offline)
            sources[source['file']] = source
            item = select_history(value, kind, identifier)
        if (item['type'] != kind or item['id'] != identifier or item.get('version', 0) <= 0 or
                not item.get('timestamp') or
                item['timestamp'] > SNAPSHOT or not item.get('visible', True)):
            raise ValueError('Invalid historical object')
        result[identifier] = item
    return result


class SelectedObjects(osmium.SimpleHandler):
    def __init__(self, kind):
        super().__init__()
        self.kind, self.objects = kind, {}

    def store(self, obj, kind):
        if kind != self.kind:
            return
        if obj.id in self.objects:
            raise ValueError('Archive contains multiple versions of one object')
        item = {'type': kind, 'id': obj.id, 'version': obj.version,
                'timestamp': obj.timestamp.isoformat().replace('+00:00', 'Z'),
                'visible': not obj.deleted, 'tags': dict(obj.tags)}
        if kind == 'relation':
            item['members'] = [{'type': {'n': 'node', 'w': 'way', 'r': 'relation'}[m.type],
                                'ref': m.ref, 'role': m.role} for m in obj.members]
        elif kind == 'way':
            item['nodes'] = [n.ref for n in obj.nodes]
        else:
            item.update(lon=obj.location.lon, lat=obj.location.lat)
        self.objects[obj.id] = item

    def relation(self, obj):
        self.store(obj, 'relation')

    def way(self, obj):
        self.store(obj, 'way')

    def node(self, obj):
        self.store(obj, 'node')


def read_objects(archive, kind, identifiers):
    selected = SelectedObjects(kind)
    types = {'relation': osmium.osm.RELATION, 'way': osmium.osm.WAY, 'node': osmium.osm.NODE}
    with osmium.io.Reader(archive, types[kind]) as reader:
        osmium.apply(reader, osmium.filter.IdFilter(identifiers), selected)
    print('Read archive', kind, len(selected.objects), '/', len(identifiers), flush=True)
    return selected.objects


def identity_tags(body, relation, output, sources, *, offline=False):
    expected = REGISTRY[body][1]
    tags = relation['tags']
    if tags.get('natural') != 'water' or tags.get('type') != 'multipolygon':
        raise ValueError(f'Unexpected historical water identity: {body}')
    if tags.get('wikidata') == expected:
        return tags, {'relationVersion': relation['version'], 'timestamp': relation['timestamp'],
                      'role': 'Labels on the historical relation'}
    # Dnister was unnamed in 2022. The first later named version adds labels
    # without changing a single member; use those labels only, never its geometry.
    if body != 'dnister' or tags.get('wikidata'):
        raise ValueError(f'Unexpected historical Wikidata identity: {body}')
    value, source = history('relation', relation['id'], output, offline=offline)
    sources[source['file']] = source
    old = select_history(value, 'relation', relation['id'])
    if old['version'] != relation['version'] or old['members'] != relation['members']:
        raise ValueError('Archive relation differs from independent historical version')
    later = sorted((e for e in value['elements'] if e['timestamp'] > SNAPSHOT and
                    e.get('tags', {}).get('wikidata') == expected), key=lambda e: e['version'])
    if not later or later[0]['members'] != relation['members']:
        raise ValueError('Later identity labels do not preserve historical relation members')
    labelled = later[0]
    return labelled['tags'], {'relationVersion': labelled['version'], 'timestamp': labelled['timestamp'],
                             'role': 'Later identity labels only; identical historical member list',
                             'source': source}


def build(archive, output, bodies=None, *, offline=False):
    bodies = list(REGISTRY) if bodies is None else bodies
    if not bodies or len(set(bodies)) != len(bodies):
        raise ValueError('Expected unique catalogue IDs')
    archive_hash = sha256(archive)
    with osmium.io.Reader(archive, osmium.osm.NOTHING) as reader:
        timestamp = reader.header().get('osmosis_replication_timestamp')
    if timestamp != ARCHIVE_TIMESTAMP or archive.stat().st_size != ARCHIVE_BYTES:
        raise ValueError('Expected the complete pinned Ukraine 2023-01-01 archive')
    receipt_path = archive.with_suffix(archive.suffix+'.json')
    receipt = {'url': ARCHIVE_URL, 'file': archive.name, 'bytes': archive.stat().st_size,
               'sha256': archive_hash, 'timestamp': timestamp,
               'licence': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors; extract by Geofabrik'}
    if receipt_path.exists() and json.loads(receipt_path.read_text()) != receipt:
        raise ValueError('Pinned archive changed since acquisition')
    output.mkdir(parents=True, exist_ok=True)
    sources = {}
    relation_ids = {REGISTRY[b][0] for b in bodies}
    relations = snapshot_objects('relation', relation_ids, read_objects(archive, 'relation', relation_ids),
                                 output, sources, offline=offline)
    labels = {b: identity_tags(b, relations[REGISTRY[b][0]], output, sources, offline=offline) for b in bodies}
    way_ids = {m['ref'] for r in relations.values() for m in r['members']
               if m['type'] == 'way' and m['role'] in {'outer', 'inner'}}
    ways = snapshot_objects('way', way_ids, read_objects(archive, 'way', way_ids), output, sources, offline=offline)
    node_ids = {n for w in ways.values() for n in w['nodes']}
    nodes = snapshot_objects('node', node_ids, read_objects(archive, 'node', node_ids), output, sources, offline=offline)
    for item in ways.values():
        item['geometry'] = [{'lon': nodes[n]['lon'], 'lat': nodes[n]['lat']} for n in item['nodes']]
    features = []
    processing_hash = sha256(Path(__file__))
    for body in bodies:
        relation = relations[REGISTRY[body][0]]
        refs = {m['ref'] for m in relation['members'] if m['type'] == 'way' and m['role'] in {'outer', 'inner'}}
        polygon = boundary(relation, {ref: ways[ref] for ref in refs})
        tags, name_source = labels[body]
        properties = {'id': body, 'nameUk': tags.get('name:uk', tags.get('name')),
                      'nameEn': tags.get('name:en'), 'snapshot': SNAPSHOT,
                      'relationId': relation['id'], 'relationVersion': relation['version'],
                      'relationTimestamp': relation['timestamp'], 'historicalTags': relation['tags'],
                      'wikidata': REGISTRY[body][1], 'nameProvenance': name_source,
                      'licence': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
                      'source': f'https://www.openstreetmap.org/relation/{relation["id"]}',
                      'role': 'Historical identity constraint; not annual water or approved analysis zone',
                      'archive': receipt, 'processingSha256': processing_hash,
                      'wayCount': len(refs), 'sources': sorted(sources.values(), key=lambda s: s['file'])}
        features.append({'type': 'Feature', 'properties': properties, 'geometry': mapping(polygon)})
        print(body, 'complete historical rings', len(refs), polygon.bounds, flush=True)
    # Every ring must pass before any identity is installed. Previous evidence
    # remains untouched if source selection, history or geometry validation fails.
    write_json(receipt_path, receipt)
    records = []
    for feature in features:
        target = output/feature['properties']['id']/'identity.geojson'
        write_json(target, feature)
        records.append({'id': feature['properties']['id'], 'file': str(target.relative_to(output)),
                        'sha256': sha256(target), 'ways': feature['properties']['wayCount']})
    report = {'purpose': 'Local historical identity constraints; national zones still require review',
              'snapshot': SNAPSHOT, 'archive': receipt, 'processingSha256': processing_hash,
              'relations': len(relations), 'ways': len(ways), 'nodes': len(nodes),
              'historySources': sorted(sources.values(), key=lambda s: s['file']), 'bodies': records}
    write_json(output/'archive-import-report.json', report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    raw = Path(__file__).resolve().parent/'data/raw/surface-water'
    parser.add_argument('--archive', type=Path, default=raw/'osm-archive/ukraine-230101.osm.pbf')
    parser.add_argument('--output', type=Path, default=raw/'catalogue-archive-identities')
    parser.add_argument('--body', choices=sorted(REGISTRY), action='append')
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    build(args.archive, args.output, args.body, offline=args.offline)
