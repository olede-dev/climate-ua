"""Writes public/data/layers/<id>.json for the climate layers (SPEC §5).

History: ERA5 by year, averaged over each region by the area each grid cell shares with it.
Future: the delta method of SPEC §5.2, per CMIP6 model, then the median and p10–p90 across
models. Run `fetch_atlas.py` and `build_oblasts.py` first.
"""

import geopandas as gpd
import numpy as np
import xarray as xr

import config
from common import cell_weights, land_regions, write_json
from fetch_atlas import atlas_file

#: Key of the whole-country series, next to the regions.
COUNTRY_ID = "ukraine"


def grid_weights(ds: xr.Dataset, regions: gpd.GeoDataFrame) -> xr.DataArray:
    """`cell_weights` on an Atlas grid, with its coordinates attached."""
    weights = cell_weights(ds["lat_bnds"].values, ds["lon_bnds"].values, regions)
    return weights.assign_coords(lat=ds["lat"], lon=ds["lon"])


def regional_mean(values: xr.DataArray, weights: xr.DataArray) -> xr.DataArray:
    """Weighted mean over each region's cells, skipping cells without a value."""
    valid = values.notnull()
    total = (values.fillna(0) * weights).sum(("lat", "lon"))
    return total / (weights * valid).sum(("lat", "lon"))


def annual(monthly: xr.DataArray, how: str) -> xr.DataArray:
    """Calendar years with all twelve months; a mean weighs each month by its days."""
    years = monthly["time"].dt.year
    complete = monthly["time"].groupby(years).count() == 12
    if how == "sum":
        result = monthly.groupby(years).sum("time")
    else:
        days = monthly["time"].dt.days_in_month
        result = (monthly * days).groupby(years).sum("time") / days.groupby(years).sum("time")
    return result.sel(year=complete["year"][complete])


def period_mean(series: xr.DataArray, period: tuple[int, int]) -> xr.DataArray:
    start, end = period
    years = series.sel(year=slice(start, end))
    if years.sizes["year"] != end - start + 1:
        raise ValueError(f"{start}–{end} is incomplete: {years.sizes['year']} years")
    return years.mean("year")


def open_cmip6(layer: config.ClimateLayer) -> xr.DataArray:
    """Monthly CMIP6 values of the models that ran both the historical and the scenario experiment."""
    runs = []
    for experiment in config.CMIP6_RUNS:
        ds = xr.open_dataset(atlas_file("cmip6", experiment, layer))
        runs.append(ds[layer.nc_name].assign_coords(member=ds["member_id"].values))
    common = sorted(set(runs[0]["member"].values) & set(runs[1]["member"].values))
    return xr.concat([run.sel(member=common) for run in runs], dim="time")


def clip(values: np.ndarray, layer: config.ClimateLayer) -> np.ndarray:
    low, high = layer.bounds
    return np.clip(values, low, high) if low is not None or high is not None else values


def build(layer: config.ClimateLayer, regions: gpd.GeoDataFrame) -> dict:
    country = gpd.GeoDataFrame({"id": [COUNTRY_ID]}, geometry=[regions.geometry.union_all()], crs=regions.crs)
    areas = gpd.GeoDataFrame(
        {"id": [*regions["id"], COUNTRY_ID]},
        geometry=[*regions.geometry, *country.geometry],
        crs=regions.crs,
    )

    era5 = xr.open_dataset(atlas_file("era5", "observed", layer))
    observed = annual(regional_mean(era5[layer.nc_name], grid_weights(era5, areas)), layer.annual)
    history = observed.sel(year=slice(config.HISTORY_FROM, None))
    norm = period_mean(observed, config.NORM)

    cmip6 = open_cmip6(layer)
    weights = grid_weights(xr.open_dataset(atlas_file("cmip6", "historical", layer)), areas)
    modelled = annual(regional_mean(cmip6, weights), layer.annual)
    model_norm = period_mean(modelled, config.NORM)

    def series(region_id: str) -> dict:
        values = history.sel(region=region_id).values
        future = {}
        for name, period in config.FUTURE_PERIODS.items():
            delta = (period_mean(modelled, period) - model_norm).sel(region=region_id).values
            per_model = clip(float(norm.sel(region=region_id)) + delta, layer)
            p10, median, p90 = np.percentile(per_model, [10, 50, 90])
            future[name] = {k: round(float(v), layer.decimals) for k, v in (("median", median), ("p10", p10), ("p90", p90))}
        return {
            "norm": round(float(norm.sel(region=region_id)), layer.decimals),
            "history": [None if np.isnan(v) else round(float(v), layer.decimals) for v in values],
            "future": future,
        }

    years = history["year"].values
    return {
        "layer": layer.id,
        "geometry": "oblasts",
        "unit": layer.unit,
        "scenario": config.CLIMATE_SCENARIO,
        "norm": {"from": config.NORM[0], "to": config.NORM[1]},
        "history": {"from": int(years[0]), "to": int(years[-1])},
        "futurePeriods": list(config.FUTURE_PERIODS),
        "models": int(cmip6.sizes["member"]),
        "country": series(COUNTRY_ID),
        "regions": {region_id: series(region_id) for region_id in regions["id"]},
        "source": config.ATLAS_SOURCE,
    }


def main() -> None:
    regions = land_regions()
    for layer in config.CLIMATE_LAYERS.values():
        data = build(layer, regions)
        path = config.PUBLIC_DATA / "layers" / f"{layer.id}.json"
        size = write_json(path, data)
        country = data["country"]
        futures = ", ".join(f"{name} {v['median']} ({v['p10']}–{v['p90']})" for name, v in country["future"].items())
        print(f"{layer.id}: {data['history']['from']}–{data['history']['to']}, {data['models']} models, {size // 1024} KB")
        print(f"  Ukraine: norm {country['norm']} {layer.unit}; {futures}")


if __name__ == "__main__":
    main()
