"""Archive acquisition must reconstruct nodes and labels at the pinned date."""
import copy
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'pipeline'))
from import_surface_water_archive import (
    API, SNAPSHOT, history, identity_tags, payload_hash, read_objects,
    select_history, snapshot_objects,
)
from prepare_surface_water_national import write_json


class ArchiveIdentityTests(unittest.TestCase):
    @staticmethod
    def cached(root, kind, identifier, elements):
        response = {'elements': elements}
        path = root/'history'/f'{kind}-{identifier}.json'
        write_json(path, {'url': f'{API}/{kind}/{identifier}/history.json',
                          'response': response, 'responseSha256': payload_hash(response)})
        return path

    def test_node_history_is_selected_independently_of_unchanged_way_version(self):
        old = {'type': 'node', 'id': 1, 'version': 3, 'timestamp': '2022-12-30T00:00:00Z',
               'lon': 30, 'lat': 50}
        new = {**old, 'version': 4, 'timestamp': '2023-01-01T12:00:00Z', 'lon': 31}
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.cached(root, 'node', 1, [old, new])
            sources = {}
            selected = snapshot_objects('node', {1}, {1: new}, root, sources, offline=True)
            self.assertEqual(selected[1]['lon'], 30)
            self.assertEqual(selected[1]['version'], 3)
            self.assertEqual(list(sources), ['history/node-1.json'])
            unchanged = snapshot_objects('node', {1}, {1: old}, root, {}, offline=True)
            self.assertEqual(unchanged, {1: old})

    def test_missing_archive_objects_can_be_recovered_but_deleted_snapshot_objects_fail(self):
        old = {'type': 'way', 'id': 2, 'version': 1, 'timestamp': '2022-01-01T00:00:00Z',
               'nodes': [1, 2, 1]}
        deletion = {**old, 'version': 2, 'timestamp': SNAPSHOT, 'visible': False}
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.cached(root, 'way', 2, [old])
            self.assertEqual(snapshot_objects('way', {2}, {}, root, {}, offline=True), {2: old})
            with self.assertRaisesRegex(ValueError, 'deleted'):
                select_history({'elements': [old, deletion]}, 'way', 2)
            with self.assertRaisesRegex(ValueError, 'wrong OSM history'):
                select_history({'elements': [old]}, 'node', 2)

    def test_corrupt_history_is_rejected_without_replacing_cached_source(self):
        node = {'type': 'node', 'id': 1, 'version': 1, 'timestamp': SNAPSHOT, 'lon': 30, 'lat': 50}
        with TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.cached(root, 'node', 1, [node])
            cached = json.loads(path.read_text())
            cached['response']['elements'][0]['lon'] = 31
            write_json(path, cached)
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, 'checksum'):
                history('node', 1, root, offline=True)
            self.assertEqual(path.read_bytes(), before)

    def test_later_dnister_labels_require_identical_historical_members(self):
        old = {'type': 'relation', 'id': 2263062, 'version': 118,
               'timestamp': '2022-03-30T17:04:22Z',
               'members': [{'type': 'way', 'ref': 2, 'role': 'outer'}],
               'tags': {'natural': 'water', 'type': 'multipolygon', 'water': 'lake'}}
        new = {**old, 'version': 119, 'timestamp': '2023-01-03T21:04:51Z',
               'tags': {**old['tags'], 'name': 'Дністровське водосховище', 'wikidata': 'Q12101431'}}
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.cached(root, 'relation', 2263062, [old, new])
            original = copy.deepcopy(old)
            tags, provenance = identity_tags('dnister', old, root, {}, offline=True)
            self.assertEqual(tags['wikidata'], 'Q12101431')
            self.assertEqual(provenance['relationVersion'], 119)
            self.assertEqual(old, original)
            changed = {**new, 'members': [{'type': 'way', 'ref': 3, 'role': 'outer'}]}
            self.cached(root, 'relation', 2263062, [old, changed])
            with self.assertRaisesRegex(ValueError, 'preserve historical relation members'):
                identity_tags('dnister', old, root, {}, offline=True)

    def test_streamed_osm_objects_retain_copied_nodes_and_exact_selected_ids(self):
        xml = '''<osm version="0.6">
          <node id="1" version="1" timestamp="2022-01-01T00:00:00Z" lat="50" lon="30"/>
          <node id="2" version="1" timestamp="2022-01-01T00:00:00Z" lat="51" lon="31"/>
          <way id="3" version="1" timestamp="2022-01-01T00:00:00Z">
            <nd ref="1"/><nd ref="2"/>
          </way>
        </osm>'''
        with TemporaryDirectory() as directory:
            path = Path(directory)/'fixture.osm'
            path.write_text(xml)
            nodes = read_objects(path, 'node', {1})
            ways = read_objects(path, 'way', {3})
            self.assertEqual(set(nodes), {1})
            self.assertEqual(nodes[1]['lon'], 30)
            self.assertEqual(ways[3]['nodes'], [1, 2])


if __name__ == '__main__':
    unittest.main()
