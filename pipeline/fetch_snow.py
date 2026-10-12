"""Downloads daily mean ERA5-Land snow water equivalent into data/raw/era5land, one file a month.

Needs a CDS account: the API key in ~/.cdsapirc and the dataset licence accepted on its page.
Files already on disk are kept, so an interrupted run resumes; delete one to download it again.
The full 1950–2025 backfill is about 900 requests and runs for days; a yearly update is twelve.
`--to YEAR` stops at the winter labelled YEAR (default: the last complete winter).
"""

import argparse
import calendar
import datetime
import time
from pathlib import Path

import cdsapi

import config


def month_file(year: int, month: int) -> Path:
    return config.ERA5LAND_DIR / f"swe_{year}-{month:02d}.nc"


def winter_months(winter: int) -> list[tuple[int, int]]:
    """(year, month) from July before `winter` through June of it."""
    start = config.SNOW_SEASON_START_MONTH
    return [(winter - 1, m) for m in range(start, 13)] + [(winter, m) for m in range(1, start)]


def request(year: int, month: int) -> dict:
    return {
        "variable": [config.ERA5LAND_VARIABLE],
        "year": str(year),
        "month": [f"{month:02d}"],
        "day": [f"{d:02d}" for d in range(1, calendar.monthrange(year, month)[1] + 1)],
        "daily_statistic": "daily_mean",
        "time_zone": "utc+02:00",
        "frequency": "1_hourly",
        "area": config.AREA,
    }


def fetch(client: cdsapi.Client, year: int, month: int) -> None:
    target = month_file(year, month)
    partial = target.with_suffix(".part")
    while True:
        try:
            client.retrieve(config.ERA5LAND_DATASET, request(year, month), str(partial))
            break
        except Exception as error:
            if "temporarily limited" not in str(error):
                raise
            print(f"  {year}-{month:02d}: CDS queue full, retrying in {config.ERA5LAND_RETRY_SECONDS // 60} min", flush=True)
            time.sleep(config.ERA5LAND_RETRY_SECONDS)
    partial.rename(target)


def last_complete_winter() -> int:
    today = datetime.date.today()
    return today.year if today.month > config.SNOW_SEASON_START_MONTH else today.year - 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="first", type=int, default=config.SNOW_FROM)
    parser.add_argument("--to", dest="last", type=int, default=last_complete_winter())
    args = parser.parse_args()

    config.ERA5LAND_DIR.mkdir(parents=True, exist_ok=True)
    months = [m for w in range(args.first, args.last + 1) for m in winter_months(w)]
    missing = [m for m in months if not month_file(*m).exists()]
    print(f"{len(months) - len(missing)} of {len(months)} months on disk; requesting {len(missing)}", flush=True)
    client = cdsapi.Client(quiet=True)
    for done, (year, month) in enumerate(missing, 1):
        fetch(client, year, month)
        print(f"[{done}/{len(missing)}] {year}-{month:02d}", flush=True)


if __name__ == "__main__":
    main()
