"""Downloads ERA5-Land snow water equivalent at 00:00 Kyiv time into data/raw/era5land, one file a year.

Needs a CDS account: the API key in ~/.cdsapirc and the dataset licence accepted on its page.
Files already on disk are kept, so an interrupted run resumes; delete one to download it again.
`--to YEAR` stops at the winter labelled YEAR (default: the last complete winter).
"""

import argparse
import datetime
import time
from pathlib import Path

import cdsapi

import config


def year_file(year: int) -> Path:
    return config.ERA5LAND_DIR / f"swe_{year}.nc"


def winter_years(winter: int) -> tuple[int, int]:
    """The calendar years a winter spans: July of the first through June of `winter`."""
    return winter - 1, winter


def request(year: int) -> dict:
    return {
        "variable": [config.ERA5LAND_VARIABLE],
        "year": str(year),
        "month": [f"{m:02d}" for m in range(1, 13)],
        "day": [f"{d:02d}" for d in range(1, 32)],
        "time": [config.ERA5LAND_TIME],
        "data_format": "netcdf",
        "download_format": "unarchived",
        "area": config.AREA,
    }


def fetch(client: cdsapi.Client, year: int) -> None:
    target = year_file(year)
    partial = target.with_suffix(".part")
    while True:
        try:
            client.retrieve(config.ERA5LAND_DATASET, request(year), str(partial))
            break
        except Exception as error:
            if "temporarily limited" not in str(error):
                raise
            print(f"  {year}: CDS queue full, retrying in {config.ERA5LAND_RETRY_SECONDS // 60} min", flush=True)
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
    years = sorted({y for w in range(args.first, args.last + 1) for y in winter_years(w)})
    missing = [y for y in years if not year_file(y).exists()]
    print(f"{len(years) - len(missing)} of {len(years)} years on disk; requesting {len(missing)}", flush=True)
    client = cdsapi.Client(quiet=True)
    for done, year in enumerate(missing, 1):
        fetch(client, year)
        print(f"[{done}/{len(missing)}] {year}", flush=True)


if __name__ == "__main__":
    main()
