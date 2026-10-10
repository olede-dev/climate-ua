"""Historical identity polygons must retain holes and complete every ring."""
import copy
import io
import json
from pathlib import Path
import sys
import unittest
from tempfile import TemporaryDirectory
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'pipeline'))
from fetch_surface_water_catalogue import boundary, download, download_ways, ENDPOINTS, SourceUnavailable
from prepare_surface_water_national import write_json


class CatalogueIdentityTests(unittest.TestCase):
    def test_transient_failure_uses_fallback_and_resume_keeps_exact_snapshot(self):
        calls = []
        def opener(request, timeout):
            calls.append(request.full_url)
            if len(calls) == 1:
                raise HTTPError(request.full_url, 504, 'Gateway timeout', {}, None)
            return io.BytesIO(b'{"elements":[{"type":"way","id":1}]}')
        with TemporaryDirectory() as directory:
            path = Path(directory)/'ways.json'
            data = download('way(1);out geom;', path, ENDPOINTS[0], opener=opener)
            cached = json.loads(path.read_text())
            self.assertEqual(cached['endpoint'], ENDPOINTS[1])
            self.assertIn('[date:"2022-12-31T23:59:59Z"]', cached['query'])
            self.assertEqual(download('way(1);out geom;', path, ENDPOINTS[0], opener=opener), data)
            self.assertEqual(len(calls), 2)
            with self.assertRaisesRegex(ValueError, 'query differs'):
                download('way(2);out geom;', path, ENDPOINTS[0], opener=opener)

    def test_exhausted_requests_never_cache_failed_response(self):
        pauses = []
        def opener(request, timeout):
            raise HTTPError(request.full_url, 504, 'Gateway timeout', {}, None)
        with TemporaryDirectory() as directory:
            path = Path(directory)/'ways.json'
            with self.assertRaises(SourceUnavailable):
                download('way(1);out geom;', path, ENDPOINTS[0], opener=opener, pause=pauses.append)
            self.assertFalse(path.exists())
            self.assertEqual(pauses, [30])

    def test_rate_limit_cools_down_and_does_not_split_unavailable_servers(self):
        pauses = []
        def opener(request, timeout):
            raise HTTPError(request.full_url, 429, 'Rate limited', {}, None)
        with TemporaryDirectory() as directory:
            path = Path(directory)/'ways.json'
            def downloader(selector, target, endpoint):
                return download(selector, target, endpoint, opener=opener, pause=pauses.append)
            with self.assertRaises(SourceUnavailable) as caught:
                download_ways([1, 2], path, ENDPOINTS[0], downloader=downloader)
            self.assertFalse(caught.exception.splittable)
            self.assertEqual(pauses, [30, 30, 30, 30, 30])
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_primary_timeout_can_split_when_backup_server_is_unavailable(self):
        def opener(request, timeout):
            code = 504 if request.full_url == ENDPOINTS[0] else 500
            raise HTTPError(request.full_url, code, 'Unavailable', {}, None)
        with TemporaryDirectory() as directory:
            path = Path(directory)/'ways.json'
            with self.assertRaises(SourceUnavailable) as caught:
                download('way(1);out geom;', path, ENDPOINTS[0], opener=opener, pause=lambda _: None)
            self.assertTrue(caught.exception.splittable)
            self.assertFalse(path.exists())

    def test_uncached_geometry_is_bounded_but_completed_legacy_batches_are_reused(self):
        sizes = []
        def downloader(selector, path, endpoint):
            if path.exists():
                return json.loads(path.read_text())['elements']
            ids = [int(value) for value in selector.split('way(id:')[1].split(')')[0].split(',')]
            sizes.append(len(ids))
            data = [{'type': 'way', 'id': value} for value in ids]
            write_json(path, {'elements': data})
            return data
        with TemporaryDirectory() as directory:
            path = Path(directory)/'ways.json'
            ids = list(range(16))
            data, sources = download_ways(ids, path, ENDPOINTS[0], downloader=downloader)
            self.assertEqual([item['id'] for item in data], ids)
            self.assertEqual(sizes, [8, 8])
            self.assertEqual(len(sources), 2)
            write_json(path, {'elements': data})
            sizes.clear()
            legacy, sources = download_ways(ids, path, ENDPOINTS[0], downloader=downloader)
            self.assertEqual(legacy, data)
            self.assertEqual(sizes, [])
            self.assertEqual([item['file'] for item in sources], ['ways.json'])

    def test_split_batches_resume_completed_children_and_reject_missing_ways(self):
        calls = []
        def downloader(selector, path, endpoint):
            if path.exists():
                return json.loads(path.read_text())['response']['elements']
            calls.append(selector)
            ids = selector.split('way(id:')[1].split(')')[0].split(',')
            if len(ids) > 1:
                raise SourceUnavailable('Timed out')
            data = [{'type': 'way', 'id': int(ids[0])}]
            write_json(path, {'response': {'elements': data}})
            return data
        with TemporaryDirectory() as directory:
            path = Path(directory)/'ways.json'
            data, sources = download_ways([1, 2, 3, 4], path, ENDPOINTS[0], downloader=downloader)
            self.assertEqual([item['id'] for item in data], [1, 2, 3, 4])
            self.assertEqual({item['file'] for item in sources},
                             {'ways-a-a.json', 'ways-a-b.json', 'ways-b-a.json', 'ways-b-b.json'})
            calls.clear()
            self.assertEqual(download_ways([1, 2, 3, 4], path, ENDPOINTS[0], downloader=downloader), (data, sources))
            self.assertEqual(calls, [])
            write_json(path, {'response': {'elements': [{'type': 'way', 'id': 1}]}})
            with self.assertRaisesRegex(ValueError, 'Incomplete historical way batch'):
                download_ways([1, 2], path, ENDPOINTS[0], downloader=downloader)

    @staticmethod
    def fixture():
        relation = {'members': [{'type': 'way', 'ref': 1, 'role': 'outer'},
                                {'type': 'way', 'ref': 2, 'role': 'outer'}]}
        ways = {1: {'type': 'way', 'geometry': [{'lon': x, 'lat': y} for x,y in [(0,0),(2,0),(2,2)]]},
                2: {'type': 'way', 'geometry': [{'lon': x, 'lat': y} for x,y in [(2,2),(0,2),(0,0)]]}}
        return relation, ways

    def test_historical_way_reconstruction_preserves_outer_extent_and_island_holes(self):
        relation, ways = self.fixture()
        self.assertEqual(boundary(relation, ways).area, 4)
        relation['members'].append({'type': 'way', 'ref': 3, 'role': 'inner'})
        ways[3] = {'type': 'way', 'geometry': [{'lon': x, 'lat': y} for x,y in
                   [(.5,.5),(1.5,.5),(1.5,1.5),(.5,1.5),(.5,.5)]]}
        polygon = boundary(relation, ways)
        self.assertEqual(polygon.area, 3)
        self.assertEqual(polygon.bounds, (0,0,2,2))
        self.assertEqual(len(polygon.interiors), 1)

    def test_missing_ways_and_open_rings_never_produce_a_partial_identity_polygon(self):
        relation, ways = self.fixture()
        with self.assertRaisesRegex(ValueError, 'every required way'):
            boundary(relation, {1:ways[1]})
        broken = copy.deepcopy(ways)
        broken[2]['geometry'][-1] = {'lon': .1, 'lat': 0}
        with self.assertRaisesRegex(ValueError, 'incomplete or invalid rings'):
            boundary(relation, broken)


if __name__ == '__main__':
    unittest.main()
