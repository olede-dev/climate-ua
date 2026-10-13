"""Run from the repository root with the existing pipeline environment:

pipeline/.venv/bin/python -m unittest discover -s tests -p 'test_snow*.py'
"""

from pathlib import Path
import sys
import unittest

import numpy as np
import pandas as pd
import xarray as xr

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
from build_snow import winter_indicators
from fetch_snow import winter_years


def cube(winter: int, swe_mm) -> xr.DataArray:
    """Two cells side by side; `swe_mm(time)` gives the daily SWE of the first, the second is sea."""
    time = pd.date_range(f"{winter - 1}-07-01", f"{winter}-06-30", freq="D")
    first = np.array([swe_mm(t) for t in time], dtype=float)
    values = np.stack([first, np.full(len(time), np.nan)], axis=1)[:, None, :]
    return xr.DataArray(values, dims=("time", "lat", "lon"), coords={"time": time, "lat": [50.0], "lon": [30.0, 30.1]})


class WinterTest(unittest.TestCase):
    def test_winter_spans_the_year_before_its_label(self):
        self.assertEqual(winter_years(1951), (1950, 1951))

    def test_indicators(self):
        # 10 mm through January, 0.5 mm (below the threshold) in February, 40 mm peak on 1 March.
        def swe(t):
            if t.month == 1:
                return 10.0
            if t.month == 2:
                return 0.5
            return 40.0 if (t.month, t.day) == (3, 1) else 0.0

        result = winter_indicators(cube(2010, swe), 2010)
        self.assertEqual(float(result["days"][0, 0]), 32)
        self.assertEqual(float(result["max"][0, 0]), 40)
        self.assertEqual(float(result["store"][0, 0]), 40)
        for key in ("days", "max", "store"):
            self.assertTrue(np.isnan(result[key][0, 1]), key)

    def test_threshold_is_inclusive(self):
        result = winter_indicators(cube(2010, lambda t: 1.0 if t.month == 12 else 0.0), 2010)
        self.assertEqual(float(result["days"][0, 0]), 31)

    def test_leap_winter(self):
        result = winter_indicators(cube(2012, lambda t: 2.0 if t.month == 2 else 0.0), 2012)
        self.assertEqual(float(result["days"][0, 0]), 29)

    def test_missing_day_is_null_not_a_short_count(self):
        data = cube(2010, lambda t: 5.0)
        result = winter_indicators(data.drop_sel(time=np.datetime64("2010-01-15")), 2010)
        for key in ("days", "max", "store"):
            self.assertTrue(np.isnan(result[key]).all(), key)

    def test_nan_day_in_a_cell_is_null(self):
        data = cube(2010, lambda t: 5.0)
        data[100, 0, 0] = np.nan
        self.assertTrue(np.isnan(winter_indicators(data, 2010)["days"][0, 0]))


if __name__ == "__main__":
    unittest.main()
