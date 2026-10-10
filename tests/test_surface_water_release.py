"""Release gates protect missingness, immutable transport and country-edge areas."""
from contextlib import redirect_stdout
import copy
import importlib.util
import io
from itertools import combinations
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import rasterio
from affine import Affine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'pipeline'))
from build_surface_water_release import validate_series
from build_surface_water_zone_areas import build as build_areas
from prepare_surface_water_national import YEARS, sha256, write_json
from surface_water import annual_areas, compare_areas
from package_surface_water_release import package

spec = importlib.util.spec_from_file_location('stage_water', Path(__file__).resolve().parents[1]/'scripts/stage-surface-water.py')
stage_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage_module)


def body():
    classes = np.array([1, 2, 3])
    weights = np.array([10., 20., 70.])
    return {'id': 'fixture', 'annual': [{'year': y, **annual_areas(classes, weights)} for y in YEARS],
            'pairs': [{'beforeYear': a, 'afterYear': b, **compare_areas(classes, classes, weights)}
                      for a, b in combinations(YEARS, 2)]}


class ReleaseTests(unittest.TestCase):
    def test_pair_partitions_mask_and_suppression_cannot_be_replaced_by_annual_subtraction(self):
        original = body()
        validate_series(original, 100.)
        bad = copy.deepcopy(original)
        bad['pairs'][0]['comparison']['gainedM2'] = 7.
        with self.assertRaisesRegex(ValueError, 'partition'):
            validate_series(bad, 100.)
        bad = copy.deepcopy(original)
        bad['pairs'][0]['validM2'] = 101.
        with self.assertRaisesRegex(ValueError, 'quality'):
            validate_series(bad, 100.)
        bad = copy.deepcopy(original)
        bad['annual'][0].update(validM2=70., coverage=.7, spatialStatus='suppressed')
        with self.assertRaisesRegex(ValueError, 'null'):
            validate_series(bad, 100.)

    def test_incomplete_timeline_and_zero_baseline_percent_are_rejected(self):
        original = body()
        bad = copy.deepcopy(original)
        bad['annual'].pop()
        with self.assertRaisesRegex(ValueError, 'timeline'):
            validate_series(bad, 100.)
        bad = copy.deepcopy(original)
        bad['pairs'].pop()
        with self.assertRaisesRegex(ValueError, 'comparisons'):
            validate_series(bad, 100.)
        dry = np.array([1])
        original['annual'] = [{'year': y, **annual_areas(dry, np.array([100.]))} for y in YEARS]
        original['pairs'] = [{'beforeYear': a, 'afterYear': b, **compare_areas(dry, dry, np.array([100.]))}
                             for a, b in combinations(YEARS, 2)]
        validate_series(original, 100.)
        original['pairs'][0]['comparison']['deltaPercent'] = 0.
        with self.assertRaisesRegex(ValueError, 'Zero baseline'):
            validate_series(original, 100.)

    def test_fractional_country_weights_are_used_for_annual_and_common_masks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            profile = {'driver': 'GTiff', 'width': 2, 'height': 1, 'count': 1,
                       'crs': 'EPSG:4326', 'transform': Affine(.001, 0, 30, 0, -.001, 50), 'dtype': 'uint8'}
            files = []
            for year, values in [(2021, [2, 0]), (2024, [3, 1])]:
                path = root/f'{year}.tif'
                with rasterio.open(path, 'w', **profile) as dst:
                    dst.write(np.array([values], dtype='uint8'), 1)
                files.append({'year': year, 'waterbodyId': 'fixture', 'product': 'YearlyHistory',
                              'file': path.name, 'sha256': sha256(path)})
            mask, weights = root/'mask.tif', root/'weights.tif'
            with rasterio.open(mask, 'w', **profile) as dst:
                dst.write(np.array([[1, 1]], dtype='uint8'), 1)
            with rasterio.open(weights, 'w', **{**profile, 'dtype': 'float64'}) as dst:
                dst.write(np.array([[90., 10.]]), 1)
            write_json(root/'inputs.json', {'files': files})
            write_json(root/'zones.json', {'zoneVersion': 'test', 'status': 'test', 'attribution': 'test',
                       'features': [{'properties': {'id': 'fixture', 'zoneM2': 100., 'maskFile': mask.name,
                        'maskSha256': sha256(mask), 'weightsFile': weights.name, 'weightsSha256': sha256(weights)}}]})
            with redirect_stdout(io.StringIO()):
                result = build_areas(root, root/'zones.json', root/'areas.json')
            annual, pair = result['bodies'][0]['annual'], result['bodies'][0]['pairs'][0]
            self.assertEqual(annual[0]['coverage'], .9)
            self.assertEqual(annual[1]['areas']['permanentM2'], 90.)
            self.assertEqual(pair['validM2'], 90.)
            self.assertEqual(pair['comparison']['seasonalToPermanentM2'], 90.)
            self.assertEqual(pair['comparison']['gainedM2'], 0.)
            self.assertEqual(pair['comparison']['deltaM2'], 0.)
            weights.write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'weights checksum'):
                build_areas(root, root/'zones.json', root/'areas.json')

    def test_verified_archive_stages_same_origin_and_corruption_preserves_existing_site(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs, site = root/'release', root/'site'
            version = 'a'*20
            target = inputs/'versions'/version
            target.mkdir(parents=True)
            data = target/'data.json'
            write_json(data, {'fixture': True})
            ref = {'url': 'data.json', 'sha256': sha256(data), 'bytes': data.stat().st_size}
            frames = []
            for year in YEARS:
                path = target/f'{year}.json'
                write_json(path, {'version': version, 'year': year, 'tiles': []})
                frames.append({'year': year, 'url': path.name, 'sha256': sha256(path), 'bytes': path.stat().st_size})
            manifest = {'schemaVersion': 1, 'version': version, 'years': list(YEARS),
                        'catalogue': [{'id': str(i), 'series': ref} for i in range(10)],
                        'chunks': [{'frames': frames}], 'overview': {'frames': frames},
                        'analysisZones': ref, 'zoneReview': ref, 'registrationSensitivity': ref}
            write_json(target/'manifest.json', manifest)
            write_json(inputs/'current.json', {'schemaVersion': 1, 'version': version,
                       'url': f'versions/{version}/manifest.json', 'sha256': sha256(target/'manifest.json'),
                       'bytes': (target/'manifest.json').stat().st_size})
            archive = root/'release.tar.gz'
            with redirect_stdout(io.StringIO()):
                report = package(inputs, archive)
            site.mkdir()
            (site/'index.html').write_text('<p>Existing application</p>')
            result = stage_module.stage(archive, report['archiveSha256'], site)
            self.assertTrue(result['verified'])
            self.assertEqual(result['siteBytes'], sum(p.stat().st_size for p in site.rglob('*') if p.is_file()))
            self.assertLess(result['featureBytes'], result['archiveUnpackedBytes'])
            self.assertEqual(json.loads((site/'data/surface-water/current.json').read_text())['version'], version)
            previous = (site/'data/surface-water/current.json').read_bytes()
            previous_archive = archive.read_bytes()
            data.write_bytes(b'corrupt immutable payload')
            with self.assertRaisesRegex(ValueError, 'Immutable release reference'):
                package(inputs, archive)
            self.assertEqual(archive.read_bytes(), previous_archive)
            archive.write_bytes(b'corrupt transport')
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                stage_module.stage(archive, report['archiveSha256'], site)
            self.assertEqual((site/'data/surface-water/current.json').read_bytes(), previous)


if __name__ == '__main__':
    unittest.main()
