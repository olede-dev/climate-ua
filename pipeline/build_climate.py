"""Writes public/data/layers/<id>.json for the climate layers (SPEC §5).

History: ERA5 by year, averaged over each region by the area each grid cell shares with it.
Future: the delta method of SPEC §5.2, per CMIP6 model, then the median and p10–p90 across
models. Day counts above or below a threshold (heat, frost) scale the change (`scaled_delta`).
Run `fetch_atlas.py` and `build_oblasts.py` first.
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
    """Calendar years with all twelve months, per grid cell; a mean weighs each month by its days.

    `dry_months` counts the months a cell's SPEI is below `config.DRY_SPEI`, so a region's value
    is the mean count over its area: a regional mean SPEI first would smooth local droughts
    away. A cell-year with a month without a value is NaN, whatever the measure: xarray's sum
    would count the month as zero (and a cell with no values at all, such as the sea, as a zero
    year), and `regional_mean` skips NaN.
    """
    years = monthly["time"].dt.year
    complete = monthly["time"].groupby(years).count() == 12
    if how == "dry_months":
        result = (monthly < config.DRY_SPEI).groupby(years).sum("time")
    elif how == "sum":
        result = monthly.groupby(years).sum("time")
    else:
        days = monthly["time"].dt.days_in_month
        result = (monthly * days).groupby(years).sum("time") / days.groupby(years).sum("time")
    result = result.where(monthly.notnull().groupby(years).sum("time") == 12)
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


def scaled_delta(delta: np.ndarray, norm: float, model_norm: np.ndarray) -> np.ndarray:
    """A model's change in a count of threshold days, rescaled to the observed climate.

    A model that runs warm has more hot days in its baseline, and as it warms its count grows
    from that larger base: added to the observed norm as it is, the change overshoots (the
    median model had 3× the hot days of ERA5 in 1991–2020, and the 2021–2040 projection
    landed well above the observed 2021–2025). Scaling by norm / model norm keeps the model's
    relative change. `SCALE_PSEUDO_DAYS` on both sides keeps the ratio finite where either has
    almost no such days, and there the change is close to added.
    """
    k = config.SCALE_PSEUDO_DAYS
    return delta * (norm + k) / (model_norm + k)


def build_grid(
    layer: config.ClimateLayer, observed: xr.DataArray, modelled: xr.DataArray, inside: xr.DataArray
) -> dict:
    """ERA5 cell by cell for the map raster, with the delta method of SPEC §5.2 per cell.

    Each model's change is interpolated from its ~1° grid onto the 0.25° ERA5 cells (clamped at
    the edge, not extrapolated) and added to the cell's observed norm: the pattern inside a
    model cell comes from ERA5, the change itself stays as coarse as the models. Cells outside
    Ukraine are null; rows run south to north and columns west to east, as in the Atlas file.
    """
    rows = np.flatnonzero(inside.any("lon").values)
    cols = np.flatnonzero(inside.any("lat").values)
    observed = observed.isel(lat=slice(rows[0], rows[-1] + 1), lon=slice(cols[0], cols[-1] + 1))
    inside = inside.isel(lat=slice(rows[0], rows[-1] + 1), lon=slice(cols[0], cols[-1] + 1))
    norm = period_mean(observed, config.NORM)

    def fill_coast(values: xr.DataArray) -> xr.DataArray:
        """Model sea cells take the nearest land value, so interpolation along the coast does not
        turn the ERA5 land cells next to them into NaN (SPEI has no value over the sea)."""
        for dim in ("lon", "lat"):
            values = values.interpolate_na(dim, method="nearest", fill_value="extrapolate")
        return values

    model_norm = fill_coast(period_mean(modelled, config.NORM))
    at = {
        "lat": observed["lat"].clip(modelled["lat"].min(), modelled["lat"].max()),
        "lon": observed["lon"].clip(modelled["lon"].min(), modelled["lon"].max()),
    }
    decimals = config.GRID_DECIMALS

    def cells(values: xr.DataArray) -> list[float | None]:
        values = values.where(inside).transpose("lat", "lon").values.ravel()
        return [None if np.isnan(v) else round(float(v), decimals) for v in values]

    future = {}
    for name, period in config.FUTURE_PERIODS.items():
        delta = (fill_coast(period_mean(modelled, period)) - model_norm).interp(at, method="linear")
        delta = delta.assign_coords(lat=observed["lat"], lon=observed["lon"])
        if layer.delta == "scale":
            k = config.SCALE_PSEUDO_DAYS
            base = model_norm.interp(at, method="linear").assign_coords(lat=observed["lat"], lon=observed["lon"])
            delta = delta * (norm + k) / (base + k)
        per_model = norm + delta
        low, high = layer.bounds
        if low is not None or high is not None:
            per_model = per_model.clip(low, high)
        future[name] = {
            key: cells(per_model.quantile(q, dim="member").drop_vars("quantile"))
            for key, q in (("median", 0.5), ("p10", 0.1), ("p90", 0.9))
        }

    lat, lon = observed["lat"].values, observed["lon"].values
    step = float(lat[1] - lat[0])
    years = observed.sel(year=slice(config.HISTORY_FROM, None))
    return {
        "layer": layer.id,
        "unit": layer.unit,
        # Outer edges of the cell block, degrees: cells are `step` wide around their centres.
        "west": round(float(lon[0]) - step / 2, 4),
        "south": round(float(lat[0]) - step / 2, 4),
        "step": step,
        "rows": len(lat),
        "cols": len(lon),
        "history": {"from": int(years["year"][0]), "to": int(years["year"][-1])},
        "norm": cells(norm),
        "values": [cells(years.sel(year=year)) for year in years["year"].values],
        "future": future,
        "source": config.ATLAS_SOURCE,
    }


def build(layer: config.ClimateLayer, regions: gpd.GeoDataFrame) -> dict:
    country = gpd.GeoDataFrame({"id": [COUNTRY_ID]}, geometry=[regions.geometry.union_all()], crs=regions.crs)
    areas = gpd.GeoDataFrame(
        {"id": [*regions["id"], COUNTRY_ID]},
        geometry=[*regions.geometry, *country.geometry],
        crs=regions.crs,
    )

    era5 = xr.open_dataset(atlas_file("era5", "observed", layer))
    era5_weights = grid_weights(era5, areas)
    era5_annual = annual(era5[layer.nc_name], layer.annual)
    observed = regional_mean(era5_annual, era5_weights)
    history = observed.sel(year=slice(config.HISTORY_FROM, None))
    norm = period_mean(observed, config.NORM)

    cmip6 = open_cmip6(layer)
    weights = grid_weights(xr.open_dataset(atlas_file("cmip6", "historical", layer)), areas)
    cmip6_annual = annual(cmip6, layer.annual)
    modelled = regional_mean(cmip6_annual, weights)
    model_norm = period_mean(modelled, config.NORM)

    def series(region_id: str) -> dict:
        values = history.sel(region=region_id).values
        future = {}
        for name, period in config.FUTURE_PERIODS.items():
            base = model_norm.sel(region=region_id).values
            delta = period_mean(modelled, period).sel(region=region_id).values - base
            observed_norm = float(norm.sel(region=region_id))
            if layer.delta == "scale":
                delta = scaled_delta(delta, observed_norm, base)
            per_model = clip(observed_norm + delta, layer)
            p10, median, p90 = np.percentile(per_model, [10, 50, 90])
            future[name] = {k: round(float(v), layer.decimals) for k, v in (("median", median), ("p10", p10), ("p90", p90))}
        return {
            "norm": round(float(norm.sel(region=region_id)), layer.decimals),
            "history": [None if np.isnan(v) else round(float(v), layer.decimals) for v in values],
            "future": future,
        }

    if layer.grid:
        grid = build_grid(layer, era5_annual, cmip6_annual, era5_weights.sel(region=COUNTRY_ID) > 0)
        size = write_json(config.PUBLIC_DATA / "grids" / f"{layer.id}.json", grid)
        print(f"  grid: {grid['rows']}×{grid['cols']} cells, {size // 1024} KB")

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
