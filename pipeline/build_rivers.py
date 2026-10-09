"""Writes public/data/rivers.json and river-norms.json from the GloFAS discharge in data/raw/rivers.

river-norms.json holds, per station, the day-of-year norm: p10/p25/median/p75/p90 of 1997–2020
values within ±3 days of the same day of year, rounded to 0.1 m³/s. A low-flow day is one whose
discharge falls below that day's p10, so low-flow days and the station card share one norm.
Days run on a 365-day calendar, so 29 February counts as 28 February and adds no day of its own.

rivers.json is the station registry the site reads, with each station's yearly count of
low-flow days, their mean over the norm period, and the mean discharge change from 1997–2010 to
2012–2025 for the whole year and for July–October.
"""

import json
import math
from datetime import date

import numpy as np

import config
from common import write_json

DAYS = 365
MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]


def day_of_year(day: str) -> int:
    d = date.fromisoformat(day)
    return MONTH_START[d.month - 1] + min(d.day, 28 if d.month == 2 else 31)


def round_half_up(value: float, digits: int) -> float:
    """Half-up rounding, not round()'s half-to-even: a p10 of x.x5 must not shift a day."""
    factor = 10**digits
    return math.floor(value * factor + 0.5) / factor


def day_norms(days: list[str], discharge: list[float | None]) -> list[dict[str, float]]:
    first, last = config.RIVERS_NORM
    buckets: list[list[float]] = [[] for _ in range(DAYS)]
    for day, q in zip(days, discharge):
        if q is not None and first <= int(day[:4]) <= last:
            buckets[day_of_year(day) - 1].append(q)
    half = config.RIVERS_NORM_HALF_WINDOW
    names = list(config.RIVER_NORM_PERCENTILES)
    norms = []
    for i in range(DAYS):
        sample = [q for k in range(i - half, i + half + 1) for q in buckets[k % DAYS]]
        if not sample:
            raise ValueError(f"no values for day of year {i + 1}")
        values = np.percentile(sample, list(config.RIVER_NORM_PERCENTILES.values()))
        norms.append({name: round_half_up(float(v), 1) for name, v in zip(names, values)})
    return norms


def low_flow_days(days: list[str], discharge: list[float | None], p10: list[float]) -> list[list[int]]:
    """Days of year below the p10 norm, per year of RIVERS_YEARS."""
    first, last = config.RIVERS_YEARS
    low: list[set[int]] = [set() for _ in range(first, last + 1)]
    for day, q in zip(days, discharge):
        doy = day_of_year(day)
        if q is not None and q < p10[doy - 1]:
            low[int(day[:4]) - first].add(doy)
    return [sorted(year) for year in low]


def mean_over(days: list[str], discharge: list[float | None], years: tuple[int, int], months=None) -> float:
    values = [
        q
        for day, q in zip(days, discharge)
        if q is not None and years[0] <= int(day[:4]) <= years[1] and (months is None or int(day[5:7]) in months)
    ]
    return sum(values) / len(values)


def change_pct(days: list[str], discharge: list[float | None], months=None) -> int:
    before = mean_over(days, discharge, config.RIVERS_BASELINE, months)
    after = mean_over(days, discharge, config.RIVERS_RECENT, months)
    return int(round_half_up((after / before - 1) * 100, 0))


def main() -> None:
    first, last = config.RIVERS_YEARS
    norm_first, norm_last = config.RIVERS_NORM
    stations = []
    norms = {}
    for station in config.RIVER_STATIONS:
        if station.basin not in config.RIVER_BASINS:
            raise ValueError(f"{station.id}: unknown basin {station.basin}")
        daily = json.loads((config.RIVERS_DIR / f"{station.id}.json").read_text())["daily"]
        days, discharge = daily["time"], daily["river_discharge"]
        if len(days) != len(discharge) or days[0] != f"{first}-01-01" or days[-1] != f"{last}-12-31":
            raise ValueError(f"{station.id}: unexpected series; delete the raw file and refetch")
        doy = day_norms(days, discharge)
        low_days = low_flow_days(days, discharge, [d["p10"] for d in doy])
        counts = [len(year) for year in low_days]
        norms[station.id] = {
            "meanAnnual": round_half_up(mean_over(days, discharge, config.RIVERS_NORM), 1),
            "doy": doy,
            "lowFlowDays": low_days,
        }
        stations.append(
            {
                "id": station.id,
                "river": station.river,
                "place": station.place,
                "riverEn": station.river_en,
                "placeEn": station.place_en,
                "basin": station.basin,
                "focus": station.focus,
                "cell": {"lat": station.cell[0], "lon": station.cell[1]},
                "marker": {"lat": station.marker[0], "lon": station.marker[1]},
                "regulated": station.regulated,
                "meanAnnual": norms[station.id]["meanAnnual"],
                "meanChangePct": change_pct(days, discharge),
                "lowSeasonChangePct": change_pct(days, discharge, config.RIVERS_LOW_SEASON_MONTHS),
                "lowFlowDays": counts,
                "normLowFlowDays": round(float(np.mean(counts[norm_first - first : norm_last - first + 1])), 1),
            }
        )
        s = stations[-1]
        print(
            f"  {station.id:26} low-flow mean {s['normLowFlowDays']:5.1f}, range {min(counts)}–{max(counts)};"
            f" change {s['meanChangePct']:+d}%, Jul–Oct {s['lowSeasonChangePct']:+d}%"
        )

    period = {"from": norm_first, "to": norm_last}
    data = {
        "years": {"from": first, "to": last},
        "norm": period,
        "baseline": dict(zip(("from", "to"), config.RIVERS_BASELINE)),
        "recent": dict(zip(("from", "to"), config.RIVERS_RECENT)),
        "basins": list(config.RIVER_BASINS),
        "stations": stations,
        "source": config.RIVERS_SOURCE,
    }
    size = write_json(config.RIVERS_PATH, data)
    print(f"Wrote {len(stations)} stations ({size} B) to {config.RIVERS_PATH}")
    norms_data = {
        "period": period,
        "smoothingWindowDays": 2 * config.RIVERS_NORM_HALF_WINDOW + 1,
        "years": {"from": first, "to": last},
        "stations": norms,
        "source": config.RIVERS_SOURCE,
    }
    size = write_json(config.RIVER_NORMS_PATH, norms_data)
    print(f"Wrote norms ({size} B) to {config.RIVER_NORMS_PATH}")


if __name__ == "__main__":
    main()
