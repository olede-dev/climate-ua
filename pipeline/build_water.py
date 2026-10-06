"""Writes public/data/layers/water.json: water stress per subbasin (SPEC §5.3), in percent.

Water stress = water people withdraw / renewable water available, upstream inflow included.

History (1980–2019). The Utrecht package has gross water demand by year (`totalGrossDemand`,
which PCR-GLOBWB takes as the withdrawal it meets) but no water availability. Aqueduct 4.0 has
the 1979–2019 stress ratio of each basin (`bws_raw`) from the same model, the same demand and
availability routed from upstream, which a basin's own grid cells cannot give. So a year's
stress is Aqueduct's long-term stress scaled by that year's Utrecht demand against the
1980–2019 mean demand of the whole basin:

    stress[year] = bws_raw × demand[year] / mean(demand[1980–2019])

Availability is the long-term mean: the year-to-year change comes from demand only.

Future: the delta method of SPEC §5.2 against Aqueduct's own baseline,
`norm + (bau{30,50,80}_ws_x_r − bws_raw)`, clipped at 0.

Sectors: the shares of irrigation, domestic and industrial demand in the last observed year.

Run `fetch_aqueduct.py` and `build_basins.py` first, and download the Utrecht package by hand
(`config.WWM_DIR`).
"""

import geopandas as gpd
import numpy as np
import pandas as pd
import xarray as xr

import config
from common import cell_weights, ukraine_basins, write_json

#: Key of the whole-country series, next to the basins.
COUNTRY_ID = "ukraine"
DECIMALS = 1
#: Grid margin around the basins, degrees.
MARGIN = 0.25


def basin_demand(basins: gpd.GeoDataFrame) -> xr.Dataset:
    """Annual demand volume (km³) of each whole basin, per sector: dims (region, year)."""
    x0, y0, x1, y1 = gpd.GeoSeries(basins["full"]).total_bounds
    weights = None
    volumes = {}
    for sector, (path, name) in config.WWM_DEMAND.items():
        ds = xr.open_dataset(path)
        depth = ds[name].sortby("lat").sel(lat=slice(y0 - MARGIN, y1 + MARGIN), lon=slice(x0 - MARGIN, x1 + MARGIN))
        if weights is None:
            half = abs(float(depth["lat"][1] - depth["lat"][0])) / 2
            lat_b = np.stack([depth["lat"].values - half, depth["lat"].values + half], axis=1)
            lon_b = np.stack([depth["lon"].values - half, depth["lon"].values + half], axis=1)
            shapes = gpd.GeoDataFrame({"id": basins["id"]}, geometry=basins["full"], crs=basins.crs)
            weights = cell_weights(lat_b, lon_b, shapes)
        # depth (m) × area (km²) / 1000 = km³
        values = np.einsum("rij,tij->rt", weights.values, np.nan_to_num(depth.values)) / 1000
        volumes[sector] = xr.DataArray(
            values, dims=("region", "year"), coords={"region": weights["region"].values, "year": depth["time"].dt.year.values}
        )
    demand = xr.Dataset(volumes)
    years = demand["year"].values
    if (years[0], years[-1]) != config.WATER_HISTORY or len(years) != years[-1] - years[0] + 1:
        raise ValueError(f"Utrecht years are {years[0]}–{years[-1]}, expected {config.WATER_HISTORY}")
    return demand


def baseline_stress(ids: list[str]) -> pd.Series:
    """Aqueduct's 1979–2019 stress ratio per basin id."""
    baseline = pd.read_csv(config.AQUEDUCT_BASELINE_CSV, usecols=["pfaf_id", "bws_raw", "bws_cat"])
    baseline = baseline.drop_duplicates("pfaf_id").assign(id=lambda df: df["pfaf_id"].astype(int).astype(str)).set_index("id")
    rows = baseline.loc[ids]
    arid = rows.index[rows["bws_cat"] == config.AQUEDUCT_ARID_CAT]
    if len(arid):
        # SPEC §13.8: none in Ukraine as of Aqueduct 4.0; the layer would need a «few data» mark.
        raise ValueError(f"Basins marked arid and low water use: {list(arid)}")
    if (rows["bws_raw"] < 0).any():
        raise ValueError(f"No baseline stress for {list(rows.index[rows['bws_raw'] < 0])}")
    return rows["bws_raw"]


def rounded(value: float) -> float:
    return round(float(value) * 100, DECIMALS)


def series(stress: np.ndarray, norm: float, future: dict[str, float]) -> dict:
    """A RegionSeries in percent; `stress` holds ratios by year."""
    return {
        "norm": rounded(norm),
        "history": [rounded(v) for v in stress],
        "future": {period: {"median": rounded(max(0.0, value))} for period, value in future.items()},
    }


def main() -> None:
    basins = ukraine_basins()
    ids = list(basins["id"])
    demand = basin_demand(basins)
    years = demand["year"].values
    bws = baseline_stress(ids)

    total = demand["total"].sel(region=ids).values
    stress = bws.values[:, None] * total / total.mean(axis=1, keepdims=True)
    in_norm = (years >= config.WATER_NORM[0]) & (years <= config.WATER_NORM[1])
    norm = stress[:, in_norm].mean(axis=1)
    future = {
        period: norm + basins[field].values - bws.values for period, field in config.AQUEDUCT_FUTURE_FIELDS.items()
    }

    # The three sector files add up to more than `total` (up to 1.4× in Ukraine), so the shares
    # are taken of their own sum.
    last = demand.sel(region=ids, year=years[-1])
    sector_sum = last["irrigation"] + last["domestic"] + last["industry"]
    sectors = {
        "irrigation": (last["irrigation"] / sector_sum).values,
        "domestic": (last["domestic"] / sector_sum).values,
        "industrial": (last["industry"] / sector_sum).values,
    }

    # Ukraine: the basins weighted by their area in Ukraine. Summing withdrawals and availability
    # instead would count water that flows through several basins once in each.
    area = basins.geometry.to_crs(config.EQUAL_AREA_CRS).area.values
    share = area / area.sum()
    country = series(share @ stress, float(share @ norm), {p: float(share @ np.maximum(v, 0)) for p, v in future.items()})

    regions = {}
    for i, basin_id in enumerate(ids):
        regions[basin_id] = {
            **series(stress[i], norm[i], {p: v[i] for p, v in future.items()}),
            "sectors": {k: round(float(v[i]), 3) for k, v in sectors.items()},
        }

    data = {
        "layer": "water",
        "geometry": "basins",
        "unit": "%",
        "scenario": config.WATER_SCENARIO,
        "norm": {"from": config.WATER_NORM[0], "to": config.WATER_NORM[1]},
        "history": {"from": int(years[0]), "to": int(years[-1])},
        "futurePeriods": list(config.AQUEDUCT_FUTURE_FIELDS),
        "country": country,
        "regions": regions,
        "source": config.WATER_SOURCE,
    }
    path = config.PUBLIC_DATA / "layers" / "water.json"
    size = write_json(path, data)
    futures = ", ".join(f"{p} {v['median']}" for p, v in country["future"].items())
    print(f"water: {years[0]}–{years[-1]}, {len(regions)} basins, {size // 1024} KB")
    print(f"  Ukraine: {years[0]} {country['history'][0]} %, {years[-1]} {country['history'][-1]} %, norm {country['norm']} %; {futures}")
    hot = sum(r["history"][-1] > 40 for r in regions.values())
    print(f"  {hot} basins above 40 % in {years[-1]}")


if __name__ == "__main__":
    main()
