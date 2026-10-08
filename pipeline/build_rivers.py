"""Writes public/data/rivers.json from the GloFAS discharge in data/raw/rivers (SPEC §4.5).

Per station: the yearly count of low-flow days and their mean over the norm period 1997–2020. A low-flow day is
one whose discharge falls below that day's p10 norm: the 10th percentile of 1997–2020 values
within ±3 days of the same day of year. Days run on a 365-day calendar, so 29 February counts as
28 February and adds no day of its own.
"""

import json
import math
from datetime import date

import numpy as np

import config
from common import write_json

DAYS = 365
#: Day of year at the start of each month in a non-leap year.
MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]


def day_of_year(day: str) -> int:
    d = date.fromisoformat(day)
    return MONTH_START[d.month - 1] + min(d.day, 28 if d.month == 2 else 31)


def p10_norm(days: list[str], discharge: list[float | None]) -> np.ndarray:
    """The p10 of each day of year over the norm period, rounded to 0.1 m³/s."""
    first, last = config.RIVERS_NORM
    buckets: list[list[float]] = [[] for _ in range(DAYS)]
    for day, q in zip(days, discharge):
        if q is not None and first <= int(day[:4]) <= last:
            buckets[day_of_year(day) - 1].append(q)
    half = config.RIVERS_NORM_HALF_WINDOW
    norm = np.empty(DAYS)
    for i in range(DAYS):
        sample = [q for k in range(i - half, i + half + 1) for q in buckets[k % DAYS]]
        if not sample:
            raise ValueError(f"no values for day of year {i + 1}")
        # Half-up rounding, not round()'s half-to-even: a p10 of x.x5 must not shift a day.
        norm[i] = math.floor(float(np.percentile(sample, 10)) * 10 + 0.5) / 10
    return norm


def low_flow_days(days: list[str], discharge: list[float | None], norm: np.ndarray) -> list[int]:
    first, last = config.RIVERS_YEARS
    low: list[set[int]] = [set() for _ in range(first, last + 1)]
    for day, q in zip(days, discharge):
        doy = day_of_year(day)
        if q is not None and q < norm[doy - 1]:
            low[int(day[:4]) - first].add(doy)
    return [len(year) for year in low]


def main() -> None:
    first, last = config.RIVERS_YEARS
    norm_first, norm_last = config.RIVERS_NORM
    stations = []
    for station in config.RIVER_STATIONS:
        daily = json.loads((config.RIVERS_DIR / f"{station.id}.json").read_text())["daily"]
        days, discharge = daily["time"], daily["river_discharge"]
        if len(days) != len(discharge) or days[0] != f"{first}-01-01" or days[-1] != f"{last}-12-31":
            raise ValueError(f"{station.id}: unexpected series; delete the raw file and refetch")
        counts = low_flow_days(days, discharge, p10_norm(days, discharge))
        stations.append(
            {
                "id": station.id,
                "river": station.river,
                "place": station.place,
                "riverEn": station.river_en,
                "placeEn": station.place_en,
                "lat": station.marker[0],
                "lon": station.marker[1],
                "lowFlowDays": counts,
                "normLowFlowDays": round(float(np.mean(counts[norm_first - first : norm_last - first + 1])), 1),
            }
        )
        print(f"  {station.id:26} mean {stations[-1]['normLowFlowDays']:5.1f}, range {min(counts)}–{max(counts)}")

    data = {
        "years": {"from": first, "to": last},
        "norm": {"from": norm_first, "to": norm_last},
        "stations": stations,
        "source": config.RIVERS_SOURCE,
    }
    size = write_json(config.RIVERS_PATH, data)
    print(f"Wrote {len(stations)} stations ({size} B) to {config.RIVERS_PATH}")


if __name__ == "__main__":
    main()
