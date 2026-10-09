"""Downloads daily GloFAS v4 discharge of every river station into data/raw/rivers, then checks
that each cell holds the gauged river: its mean discharge must match the station's expected range.

Open-Meteo weighs long history requests as many calls, so a run can hit the per-minute limit;
only HTTP 429 is retried, after the minute is over.
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import config

MAX_ATTEMPTS = 5
RATE_LIMIT_WAIT_S = 65
PAUSE_S = 0.3


def fetch(url: str) -> bytes:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(url, timeout=120) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == MAX_ATTEMPTS:
                raise
            print(f"  rate limited, waiting {RATE_LIMIT_WAIT_S} s (attempt {attempt})")
            time.sleep(RATE_LIMIT_WAIT_S)
    raise AssertionError("unreachable")


def cell_mean(station: config.RiverStation) -> float:
    daily = json.loads((config.RIVERS_DIR / f"{station.id}.json").read_text())["daily"]
    first, last = config.RIVERS_VALIDATION_YEARS
    values = [
        q for day, q in zip(daily["time"], daily["river_discharge"]) if q is not None and first <= int(day[:4]) <= last
    ]
    return sum(values) / len(values)


def validate() -> None:
    """A cell whose mean is off by more than the tolerance holds another river (often a
    tributary): move `cell` in config.py to a neighbouring GloFAS cell with the expected flow."""
    low_factor, high_factor = config.RIVERS_VALIDATION_TOLERANCE
    failed = []
    for station in config.RIVER_STATIONS:
        mean = cell_mean(station)
        low, high = station.expected_mean_range
        ok = low * low_factor <= mean <= high * high_factor
        print(f"  {station.id:26} mean {mean:8.1f} m³/s, expected {low:g}–{high:g}{'' if ok else '  OUT OF RANGE'}")
        if not ok:
            failed.append(station.id)
    if failed:
        sys.exit(f"Cells outside the expected range: {', '.join(failed)}")


def main() -> None:
    first, last = config.RIVERS_YEARS
    for station in config.RIVER_STATIONS:
        target = config.RIVERS_DIR / f"{station.id}.json"
        if target.exists():
            print(f"Keeping {target.name}")
            continue
        query = urllib.parse.urlencode(
            {
                "latitude": station.cell[0],
                "longitude": station.cell[1],
                "daily": "river_discharge",
                "start_date": f"{first}-01-01",
                "end_date": f"{last}-12-31",
            }
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(fetch(f"{config.FLOOD_API_URL}?{query}"))
        print(f"Wrote {target.name}")
        time.sleep(PAUSE_S)
    validate()


if __name__ == "__main__":
    main()
