"""Run from the repository root with the existing pipeline environment:

pipeline/.venv/bin/python -m unittest discover -s tests -p 'test_surface_water.py'
"""

import json
from pathlib import Path
import sys
import unittest

import numpy as np
from affine import Affine
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
from surface_water import annual_areas, compare_areas, intersection_areas


class SurfaceWaterTests(unittest.TestCase):
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
