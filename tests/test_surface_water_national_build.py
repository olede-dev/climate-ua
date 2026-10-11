"""Offline national rendering checks: ownership, missingness and safe resume."""
import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
import io

import numpy as np
import rasterio
from affine import Affine
from shapely.geometry import box, mapping

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
from build_surface_water_national import build, encode, owned_window
from build_surface_water_overview import build as build_overview
from extract_surface_water_national import extract
from package_surface_water_tiles import package as package_tiles
from prepare_surface_water_national import YEARS, VERSION, collection, sha256


class NationalTileTests(unittest.TestCase):
    def test_overview_selects_exact_native_codes_and_rejects_changed_sources_on_resume(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            boundary = self.write_sources(root)
            output = root/'overview'
            with redirect_stdout(io.StringIO()):
                result = build_overview(root, boundary, output, factor=2)
            frame = json.loads((output/result['frames'][0]['url']).read_text())
            tile = frame['tiles'][0]
            packed = np.frombuffer(gzip.decompress((output/tile['url']).read_bytes()), dtype='uint8')
            decoded = np.stack([packed & 15, packed >> 4], axis=1).ravel().reshape(2, 2)
            np.testing.assert_array_equal(decoded, [[15, 1], [15, 1]])
            baseline = (output/'overview.json').read_bytes()
            with redirect_stdout(io.StringIO()):
                build_overview(root, boundary, output, factor=2)
            self.assertEqual((output/'overview.json').read_bytes(), baseline)
            (root/'year-2024.tif').write_bytes(b'changed annual source')
            with self.assertRaisesRegex(ValueError, 'annual source changed'):
                build_overview(root, boundary, output, factor=2)
            self.assertEqual((output/'overview.json').read_bytes(), baseline)

    def test_shared_fragment_cells_have_one_owner_including_exact_centres(self):
        # Both rasters contain the cell centred on x=31. A half-open envelope
        # assigns that cell to the eastern fragment exactly once.
        left = owned_window(Affine(.4, 0, 30, 0, -.4, 50), [30, 49, 31, 50], 3, 3)
        right = owned_window(Affine(.4, 0, 30.8, 0, -.4, 50), [31, 49, 32, 50], 3, 3)
        self.assertEqual((left.col_off, left.width), (0, 2))
        self.assertEqual((right.col_off, right.width), (0, 3))
        # North edge excluded and south edge included on a centre-aligned grid.
        vertical = owned_window(Affine(.4, 0, 30, 0, -.5, 50.25), [30, 49, 31, 50], 3, 4)
        self.assertEqual((vertical.row_off, vertical.height), (1, 2))

    def test_packed_tiles_preserve_unobserved_and_country_exterior_with_odd_padding(self):
        payload = encode(np.array([[0, 1, 2, 3, 15]], dtype='uint8'))
        self.assertEqual(gzip.decompress(payload), bytes([0x10, 0x32, 0xff]))
        self.assertEqual(payload, encode([0, 1, 2, 3, 15]))
        with self.assertRaisesRegex(ValueError, 'Undocumented'):
            encode([4])

    def test_real_raster_build_preserves_classes_and_resume_refuses_corruption(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            boundary = self.write_sources(root)
            output = root/'output'
            with redirect_stdout(io.StringIO()):
                result = build(root, boundary, output, workers=1)
            index = output/'frames/e30-n49.json'
            original = index.read_bytes()
            frame = json.loads(original)
            self.assertTrue(result['completeTimeline'])
            self.assertEqual(result['uniqueTiles'], 1)
            self.assertEqual(frame['frames'][0]['counts'], [4, 4, 0, 0])
            asset = next(iter(frame['assets'].values()))
            packed = np.frombuffer(gzip.decompress((output/asset['url']).read_bytes()), dtype='uint8')
            decoded = np.stack([packed & 15, packed >> 4], axis=1).ravel().reshape(4, 4)
            np.testing.assert_array_equal(decoded, np.tile([15, 15, 0, 1], (4, 1)))
            with redirect_stdout(io.StringIO()):
                build(root, boundary, output, workers=1)
            self.assertEqual(index.read_bytes(), original)
            (output/asset['url']).write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'Resume tile checksum'):
                build(root, boundary, output, workers=1)
            self.assertEqual(index.read_bytes(), original)

    def test_native_archive_is_deterministic_and_corrupt_tiles_preserve_existing_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            boundary = self.write_sources(root)
            output, archive = root/'output', root/'native.tar.gz'
            with redirect_stdout(io.StringIO()):
                build(root, boundary, output, workers=1)
                report = package_tiles(output, archive)
            original = archive.read_bytes()
            self.assertEqual(report['memberCount'], 4)
            self.assertEqual(sha256(archive), report['archiveSha256'])
            with redirect_stdout(io.StringIO()):
                package_tiles(output, archive)
            self.assertEqual(archive.read_bytes(), original)
            asset = next((output/'tiles').rglob('*.bin.gz'))
            asset.write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'Immutable asset changed'):
                package_tiles(output, archive)
            self.assertEqual(archive.read_bytes(), original)

    @staticmethod
    def write_sources(root):
        boundary = root/'boundary.geojson'
        boundary.write_text(json.dumps({'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'properties': {}, 'geometry': mapping(box(30.4, 49, 31, 50))}]}))
        chunks = [{'id': 'e30-n49', 'downloadEnvelope': [30, 49, 31, 50]}]
        entries = []
        for year in YEARS:
            path = root/f'year-{year}.tif'
            transform = Affine(.25, 0, 30, 0, -.25, 50)
            with rasterio.open(path, 'w', driver='GTiff', width=4, height=4, count=1,
                               dtype='uint8', nodata=0, crs='EPSG:4326', transform=transform) as dst:
                dst.write(np.tile(np.array([3, 2, 0, 1], dtype='uint8'), (4, 1)), 1)
            entries.append({'chunkId': 'e30-n49', 'year': year, 'file': path.name,
                'product': 'YearlyHistory', 'band': 'waterClass',
                'sha256': sha256(path), 'shape': [4, 4], 'transform': list(transform)[:6],
                'downloadEnvelope': json.dumps([30, 49, 31, 50]),
                'collection': collection(year), 'nationalClipBoundarySha256': sha256(boundary)})
        requests = root/'requests.json'
        requests.write_text(json.dumps({'chunks': chunks, 'attribution': 'fixture', 'boundaryAttribution': 'fixture'}))
        (root/'inputs.json').write_text(json.dumps({'complete': True, 'missing': [],
            'sourceVersion': VERSION, 'requestsSha256': sha256(requests),
            'boundarySha256': sha256(boundary), 'files': entries}))
        return boundary

    def test_zone_extraction_preserves_the_pinned_grid_and_all_annual_classes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_sources(root)
            transform = Affine(.25, 0, 30, 0, -.25, 50)
            mask = root/'zone-mask.tif'
            with rasterio.open(mask, 'w', driver='GTiff', width=4, height=4, count=1,
                               dtype='uint8', crs='EPSG:4326', transform=transform) as dst:
                dst.write(np.tile(np.array([0, 0, 1, 1], dtype='uint8'), (4, 1)), 1)
            zones = root/'zones.geojson'
            zones.write_text(json.dumps({'zoneVersion': 'fixture', 'features': [{
                'properties': {'id': 'lake', 'maskFile': mask.name, 'maskSha256': sha256(mask)},
                'geometry': mapping(box(30.5, 49, 31, 50))}]}))
            with redirect_stdout(io.StringIO()):
                crops = extract(root, zones, root/'crops')
            self.assertEqual(len(crops['files']), 41)
            with rasterio.open(root/'crops'/crops['files'][0]['file']) as crop:
                np.testing.assert_array_equal(crop.read(1), np.tile([3, 2, 0, 1], (4, 1)))
                self.assertEqual(crop.transform, transform)
            previous = (root/'crops/inputs.json').read_bytes()
            audit_path = root/'inputs.json'
            audit = json.loads(audit_path.read_text())
            audit['files'][0]['product'] = 'MonthlyHistory'
            audit_path.write_text(json.dumps(audit))
            with self.assertRaisesRegex(ValueError, 'exact annual provenance'):
                extract(root, zones, root/'crops')
            self.assertEqual((root/'crops/inputs.json').read_bytes(), previous)


if __name__ == '__main__':
    unittest.main()
