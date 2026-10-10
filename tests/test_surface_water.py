"""Run from the repository root with the existing pipeline environment:

pipeline/.venv/bin/python -m unittest discover -s tests -p 'test_surface_water.py'
"""

from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from affine import Affine
from pyproj import Geod, Transformer
import rasterio
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
from surface_water import (annual_areas, compare_areas, geographic_intersection_areas,
                           intersection_areas, raster_areas)
from build_surface_water_prototype import build


class SurfaceWaterTests(unittest.TestCase):
    def test_diagnostic_build_is_deterministic_and_does_not_replace_output_after_source_corruption(self):
        transform = Affine(0.00025, 0, 30, 0, -0.00025, 50)
        with tempfile.TemporaryDirectory() as directory:
            inputs = Path(directory)
            entries = []
            for year, data in [(2023, [2, 3]), (2022, [3, 1])]:
                path = inputs / f"fixture-{year}.tif"
                self.write_raster(path, data, transform)
                entries.append({
                    "file": path.name, "product": "yearly", "waterbodyId": "fixture",
                    "year": year, "distribution": "Numerical fixture, not a JRC source",
                    "downloadEnvelope": [30, 49.99975, 30.0005, 50],
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "crs": "EPSG:4326", "shape": [1, 2], "transform": list(transform)[:6],
                })
            (inputs / "inputs.json").write_text(json.dumps({"attribution": "Numerical fixture", "files": entries}))
            output = inputs / "result.json"
            with redirect_stdout(io.StringIO()):
                build(inputs, output)
                first = output.read_bytes()
                build(inputs, output)
            self.assertEqual(output.read_bytes(), first)
            envelope = json.loads(first)["envelopes"][0]
            self.assertEqual([a["year"] for a in envelope["annual"]], [2022, 2023])
            pair = envelope["pairs"][0]
            self.assertEqual((pair["beforeYear"], pair["afterYear"]), (2022, 2023))
            self.assertAlmostEqual(pair["comparison"]["deltaPercent"], 100, delta=1e-6)
            self.assertEqual(pair["comparison"]["lostM2"], 0)
            (inputs / entries[0]["file"]).write_bytes(b"corrupted download")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                build(inputs, output)
            self.assertEqual(output.read_bytes(), first)

    def test_geographic_pixels_use_ellipsoidal_area_and_fractional_boundaries(self):
        project = Transformer.from_crs(4326, 6933, always_xy=True)
        geod = Geod(ellps="WGS84")
        for lat in (47, 51):
            with self.subTest(latitude=lat):
                west, south = project.transform(30, lat)
                east, north = project.transform(30.00025, lat + 0.00025)
                zone = box(west, south, (west + east) / 2, north)
                weights = geographic_intersection_areas(
                    Affine(0.00025, 0, 30, 0, -0.00025, lat + 0.00025), (1, 1), zone)
                # Independent ellipsoidal polygon area; tiny geodesic/parallels
                # edge difference is below this numerical reference tolerance.
                reference, _ = geod.polygon_area_perimeter(
                    [30, 30.00025, 30.00025, 30], [lat, lat, lat + 0.00025, lat + 0.00025])
                self.assertAlmostEqual(float(weights.sum()), reference / 2, delta=1e-5)
                self.assertLess(float(weights.sum()), 300)  # Not a nominal 450 m² half pixel.

    @staticmethod
    def write_raster(path, data, transform, mask=None):
        values = np.array([data], dtype=np.uint8)
        with rasterio.open(path, "w", driver="GTiff", width=values.shape[1], height=1,
                           count=1, dtype="uint8", crs="EPSG:4326", transform=transform) as target:
            target.write(values, 1)
            if mask is not None:
                target.write_mask(np.array([mask], dtype=np.uint8))

    def test_windowed_pair_keeps_common_mask_across_block_edges(self):
        transform = Affine(0.00025, 0, 30, 0, -0.00025, 50)
        project = Transformer.from_crs(4326, 6933, always_xy=True)
        west, south = project.transform(30, 49.99975)
        east, north = project.transform(30.0025, 50)
        zone = box(west, south, east, north)
        cell_m2 = zone.area / 10
        with tempfile.TemporaryDirectory() as directory:
            before, after = (Path(directory) / name for name in ("before.tif", "after.tif"))
            self.write_raster(before, [3, 2, 1, 3, 1, 1, 3, 2, 1, 1], transform,
                              [255, 255, 255, 255, 0, 255, 255, 255, 255, 255])
            self.write_raster(after, [2, 3, 3, 1, 3, 1, 3, 2, 1, 1], transform,
                              [255, 255, 255, 255, 255, 0, 255, 255, 255, 255])
            for block_size in (1, 3, 256):
                with self.subTest(block_size=block_size):
                    result = raster_areas(before, zone, product="YearlyHistory", after=after,
                                          block_size=block_size)
                    self.assertAlmostEqual(result["validM2"], 8 * cell_m2, delta=1e-5)
                    comparison = result["comparison"]
                    self.assertIsNotNone(comparison)
                    self.assertAlmostEqual(comparison["before"]["unionM2"], 5 * cell_m2, delta=1e-5)
                    self.assertAlmostEqual(comparison["after"]["unionM2"], 5 * cell_m2, delta=1e-5)
                    self.assertAlmostEqual(comparison["gainedM2"], cell_m2, delta=1e-5)
                    self.assertAlmostEqual(comparison["lostM2"], cell_m2, delta=1e-5)
                    self.assertAlmostEqual(comparison["persistentM2"], 4 * cell_m2, delta=1e-5)
                    self.assertAlmostEqual(comparison["permanentToSeasonalM2"], cell_m2, delta=1e-5)
                    self.assertAlmostEqual(comparison["seasonalToPermanentM2"], cell_m2, delta=1e-5)

    def test_native_rasters_reject_missing_zone_extent_misalignment_and_monthly_products(self):
        transform = Affine(0.00025, 0, 30, 0, -0.00025, 50)
        project = Transformer.from_crs(4326, 6933, always_xy=True)
        west, south = project.transform(30, 49.99975)
        east, north = project.transform(30.00025, 50)
        zone = box(west, south, east, north)
        with tempfile.TemporaryDirectory() as directory:
            before, after = (Path(directory) / name for name in ("before.tif", "after.tif"))
            self.write_raster(before, [3], transform)
            self.write_raster(after, [3], transform @ Affine.translation(1, 0))
            with self.assertRaisesRegex(ValueError, "identical native grids"):
                raster_areas(before, zone, product="YearlyHistory", after=after)
            with self.assertRaisesRegex(ValueError, "entire analysis zone"):
                raster_areas(before, box(west, south, east + 10, north), product="YearlyHistory")
            with self.assertRaisesRegex(ValueError, "yearly products"):
                raster_areas(before, zone, product="MonthlyHistory")

    def test_asymmetric_missingness_uses_common_mask_not_annual_difference(self):
        fixture = json.loads((Path(__file__).parent / "fixtures/surface-water/areas.json").read_text())
        before, after, weights = (fixture[k] for k in ("before", "after", "weightsM2"))
        expected = fixture["expected"]
        a = annual_areas(before, weights)
        b = annual_areas(after, weights)
        pair = compare_areas(before, after, weights)
        self.assertEqual(a["zoneM2"], expected["zoneM2"])
        self.assertEqual(a["areas"]["unionM2"], expected["annualBeforeUnionM2"])
        self.assertEqual(b["areas"]["unionM2"], expected["annualAfterUnionM2"])
        self.assertEqual(pair["validM2"], expected["commonM2"])
        self.assertEqual(pair["spatialStatus"], "partial")
        comparison = pair["comparison"]
        self.assertEqual(comparison["before"]["unionM2"], expected["pairBeforeUnionM2"])
        self.assertEqual(comparison["after"]["unionM2"], expected["pairAfterUnionM2"])
        for key in ("gainedM2", "lostM2", "persistentM2", "permanentToSeasonalM2",
                    "seasonalToPermanentM2", "deltaM2", "deltaPercent"):
            with self.subTest(key=key):
                self.assertEqual(comparison[key], expected[key])
        self.assertEqual(comparison["before"]["permanentM2"], 2700)
        self.assertEqual(comparison["before"]["seasonalM2"], 1800)
        self.assertEqual(comparison["after"]["permanentM2"], 2250)
        self.assertEqual(comparison["after"]["seasonalM2"], 1800)

    def test_zero_baseline_has_no_percentage_and_dry_is_valid(self):
        pair = compare_areas([1, 1], [2, 3], [450, 900])
        self.assertEqual(pair["coverage"], 1)
        self.assertEqual(pair["comparison"]["deltaM2"], 1350)
        self.assertIsNone(pair["comparison"]["deltaPercent"])
        self.assertEqual(annual_areas([1, 1], [450, 900])["areas"]["unionM2"], 0)

    def test_no_data_suppresses_instead_of_creating_false_loss(self):
        annual = annual_areas([0, 0], [900, 900])
        pair = compare_areas([3, 3], [0, 0], [900, 900])
        self.assertEqual(annual["validM2"], 0)
        self.assertIsNone(annual["areas"])
        self.assertIsNone(pair["comparison"])

    def test_spatial_thresholds_do_not_claim_temporal_completeness(self):
        for valid, status in [(79, "suppressed"), (80, "partial"), (94, "partial"), (95, "complete")]:
            with self.subTest(valid=valid):
                result = annual_areas([3, 0], [valid, 100 - valid])
                self.assertEqual(result["spatialStatus"], status)
                self.assertEqual(result["temporalCompleteness"], "unknown")

    def test_spatial_gate_roundoff_does_not_override_missingness(self):
        self.assertEqual(annual_areas([3, 0], [80 - 1e-11, 20 + 1e-11])["spatialStatus"], "partial")
        self.assertEqual(annual_areas([3, 0], [80 - 1e-8, 20 + 1e-8])["spatialStatus"], "suppressed")
        self.assertEqual(annual_areas([0], [1e-10])["spatialStatus"], "suppressed")

    def test_boundary_pixels_use_intersections_in_square_metres(self):
        weights = intersection_areas(Affine(30, 0, 0, 0, -30, 30), (1, 2), box(15, 0, 45, 30))
        np.testing.assert_allclose(weights, [[450, 450]], atol=1e-9)
        result = annual_areas([[3, 2]], weights)
        self.assertEqual(result["areas"], {"permanentM2": 450, "seasonalM2": 450, "unionM2": 900})

    def test_invalid_or_encoded_inputs_fail_instead_of_becoming_dry(self):
        for classes, weights in [([255], [900]), ([1.5], [900]), ([1], [-1]),
                                 ([1], [float("nan")]), ([1], [0]), ([1], [1, 2])]:
            with self.subTest(classes=classes, weights=weights):
                with self.assertRaises(ValueError):
                    annual_areas(classes, weights)


if __name__ == "__main__":
    unittest.main()
