"""Writes public/data/layers/snow-*.json and public/data/grids/snow-*.json from ERA5-Land SWE.

Each winter (July–June, labelled by its January) is reduced to three indicators per 0.1° cell:
days with SWE ≥ `SNOW_DAY_MM`, the highest daily SWE and the SWE on 1 March. Regions then
average the cell values by overlap area, as the climate layers do, so local snow is not
smoothed away before counting. No projections: the C3S Atlas has no snow indices.
Run `fetch_snow.py` and `build_oblasts.py` first.
"""

import datetime

import geopandas as gpd
import numpy as np
import xarray as xr

import config
from build_climate import COUNTRY_ID, period_mean, regional_mean
from common import cell_weights, land_regions, write_json
from fetch_snow import last_complete_winter, winter_years, year_file


def on_disk(winter: int) -> bool:
    return all(year_file(y).exists() for y in winter_years(winter))


def open_winter(winter: int) -> xr.DataArray:
    """Daily SWE in mm, dims (time, lat, lon), lat south to north, time at the UTC date."""
    years = [xr.open_dataset(year_file(y))[config.ERA5LAND_NC_NAME] for y in winter_years(winter)]
    swe = xr.concat(years, dim="valid_time").drop_vars(["number", "expver"], errors="ignore")
    swe = swe.rename(valid_time="time", latitude="lat", longitude="lon").sortby("lat")
    swe = swe.assign_coords(time=swe["time"].dt.floor("D"))
    start = datetime.date(winter - 1, config.SNOW_SEASON_START_MONTH, 1)
    end = datetime.date(winter, config.SNOW_SEASON_START_MONTH, 1) - datetime.timedelta(days=1)
    return swe.sel(time=slice(str(start), str(end))).load() * 1000


def winter_indicators(swe: xr.DataArray, winter: int) -> dict[str, xr.DataArray]:
    """The three indicators per cell for one winter of daily SWE (mm).

    A winter without every one of its days is NaN everywhere, and a cell with a NaN day (the
    sea) is NaN: a partial count would read as a short winter.
    """
    start = datetime.date(winter - 1, config.SNOW_SEASON_START_MONTH, 1)
    days = (datetime.date(winter, config.SNOW_SEASON_START_MONTH, 1) - start).days
    expected = np.arange(np.datetime64(start, "D"), np.datetime64(start, "D") + np.timedelta64(days, "D"))
    complete = swe.sizes["time"] == days and np.array_equal(swe["time"].values.astype("datetime64[D]"), expected)
    valid = swe.notnull().all("time") & complete
    month, day = config.SNOW_STORE_DAY
    store = swe.sel(time=np.datetime64(datetime.date(winter, month, day))) if complete else swe.isel(time=0)
    return {
        "days": (swe >= config.SNOW_DAY_MM).sum("time").where(valid),
        "max": swe.max("time").where(valid),
        "store": store.drop_vars("time").where(valid),
    }


def cell_bounds(centres: np.ndarray) -> np.ndarray:
    half = float(centres[1] - centres[0]) / 2
    return np.stack([centres - half, centres + half], axis=1)


def build_grid(layer: config.SnowLayer, values: xr.DataArray, inside: xr.DataArray) -> dict:
    """The map raster: blocks of `SNOW_GRID_COARSEN`² ERA5-Land cells, each the mean of its
    valid cells, cropped to Ukraine; rows south to north. A block touching Ukraine is kept."""
    n = config.SNOW_GRID_COARSEN
    rows = np.flatnonzero(inside.any("lon").values)
    cols = np.flatnonzero(inside.any("lat").values)
    crop = {"lat": slice(rows[0], rows[-1] + 1), "lon": slice(cols[0], cols[-1] + 1)}
    values = values.isel(crop).coarsen(lat=n, lon=n, boundary="pad").mean()
    inside = inside.isel(crop).coarsen(lat=n, lon=n, boundary="pad").max().astype(bool)
    decimals = config.SNOW_GRID_DECIMALS

    def cells(field: xr.DataArray) -> list[float | None]:
        flat = field.where(inside).transpose("lat", "lon").values.ravel()
        return [None if np.isnan(v) else round(float(v), decimals) for v in flat]

    lat, lon = values["lat"].values, values["lon"].values
    step = round(float(lat[1] - lat[0]), 4)
    return {
        "layer": layer.id,
        "unit": layer.unit,
        "west": round(float(lon[0]) - step / 2, 4),
        "south": round(float(lat[0]) - step / 2, 4),
        "step": step,
        "rows": len(lat),
        "cols": len(lon),
        "history": {"from": int(values["year"][0]), "to": int(values["year"][-1])},
        "norm": cells(period_mean(values, config.NORM)),
        "values": [cells(values.sel(year=year)) for year in values["year"].values],
        "future": {},
        "source": config.SNOW_SOURCE,
    }


def layer_file(layer: config.SnowLayer, values: xr.DataArray, weights: xr.DataArray, region_ids: list[str]) -> dict:
    regional = regional_mean(values, weights)
    norm = period_mean(regional, config.NORM)

    def series(region_id: str) -> dict:
        history = regional.sel(region=region_id).values
        return {
            "norm": round(float(norm.sel(region=region_id)), layer.decimals),
            "history": [None if np.isnan(v) else round(float(v), layer.decimals) for v in history],
            "future": {},
        }

    years = values["year"].values
    return {
        "layer": layer.id,
        "geometry": "oblasts",
        "unit": layer.unit,
        "scenario": None,
        "norm": {"from": config.NORM[0], "to": config.NORM[1]},
        "history": {"from": int(years[0]), "to": int(years[-1])},
        "futurePeriods": [],
        "country": series(COUNTRY_ID),
        "regions": {region_id: series(region_id) for region_id in region_ids},
        "source": config.SNOW_SOURCE,
    }


def main() -> None:
    regions = land_regions()
    country = gpd.GeoDataFrame({"id": [COUNTRY_ID]}, geometry=[regions.geometry.union_all()], crs=regions.crs)
    areas = gpd.GeoDataFrame(
        {"id": [*regions["id"], COUNTRY_ID]}, geometry=[*regions.geometry, *country.geometry], crs=regions.crs
    )

    found = {w: winter_indicators(open_winter(w), w) for w in range(config.SNOW_FROM, last_complete_winter() + 1) if on_disk(w)}
    if not found:
        raise SystemExit("No complete winter on disk; run fetch_snow.py")
    template = next(iter(found.values()))["max"] * np.nan
    winters = range(config.SNOW_FROM, max(found) + 1)
    for winter in sorted(set(winters) - set(found)):
        print(f"  {winter}: years missing, null")
    cubes = {
        key: xr.concat([found.get(w, {}).get(key, template).expand_dims(year=[w]) for w in winters], dim="year")
        for key in ("days", "max", "store")
    }

    lat, lon = template["lat"].values, template["lon"].values
    weights = cell_weights(cell_bounds(lat), cell_bounds(lon), areas).assign_coords(lat=lat, lon=lon)
    inside = weights.sel(region=COUNTRY_ID) > 0

    for layer in config.SNOW_LAYERS.values():
        values = cubes[layer.indicator]
        data = layer_file(layer, values, weights, list(regions["id"]))
        size = write_json(config.PUBLIC_DATA / "layers" / f"{layer.id}.json", data)
        grid = build_grid(layer, values, inside)
        grid_size = write_json(config.PUBLIC_DATA / "grids" / f"{layer.id}.json", grid)
        norms = {r: data["regions"][r]["norm"] for r in ("lviv", "odesa")}
        print(f"{layer.id}: {data['history']['from']}–{data['history']['to']}, {size // 1024} KB, grid {grid_size // 1024} KB")
        print(f"  norm: Ukraine {data['country']['norm']} {layer.unit}, {norms}")


if __name__ == "__main__":
    main()
