"""Downloads daily GloFAS v4 discharge of every river station into data/raw/rivers (SPEC §4.5).

Open-Meteo weighs long history requests as many calls, so a run can hit the per-minute limit;
only HTTP 429 is retried, after the minute is over.
"""

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


if __name__ == "__main__":
    main()
