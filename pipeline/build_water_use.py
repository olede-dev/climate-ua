"""Writes public/data/water-use.json: water demand and the water gap per subbasin and sector, by year.

The views of the World Water Map (worldwatermap.nationalgeographic.org) on the same data
package: how much water people need (demand) and how much of it comes from non-renewable
water, fossil groundwater (the gap). Values are volumes in the part of each basin inside
Ukraine, so the basins add up to the country. Demand is in km³, the gap in million m³: the
gap in Ukraine is about a hundredth of the demand.

The package has no projection; the future of the water layer stays the stress ratio of
`build_water.py`.

Download the Utrecht package by hand first (`config.WWM_DIR`) and run `build_basins.py`.
"""

import geopandas as gpd
import numpy as np
import xarray as xr

import config
from common import cell_weights, ukraine_basins, write_json

#: Grid margin around the basins, degrees.
MARGIN = 0.25
#: Output sector names (the site's) → the package's.
SECTORS = {"total": "total", "irrigation": "irrigation", "domestic": "domestic", "industrial": "industry"}
#: Per view: the source files, km³ → the unit written, and the decimals kept.
VIEWS = {
    "demand": (config.WWM_DEMAND, 1.0, "km³", 3),
    "gap": (config.WWM_GAP, 1000.0, "млн м³", 2),
}


def volumes(basins: gpd.GeoDataFrame, files: dict[str, tuple]) -> dict[str, np.ndarray]:
    """Annual volume (km³) in each basin's part of Ukraine, per package sector: (region, year)."""
    x0, y0, x1, y1 = basins.total_bounds
    weights = None
    out = {}
    for sector, (path, name) in files.items():
        depth = xr.open_dataset(path)[name].sortby("lat").sel(
            lat=slice(y0 - MARGIN, y1 + MARGIN), lon=slice(x0 - MARGIN, x1 + MARGIN)
        )
        years = depth["time"].dt.year.values
        if (years[0], years[-1]) != config.WATER_HISTORY or len(years) != years[-1] - years[0] + 1:
            raise ValueError(f"{path.name}: years {years[0]}–{years[-1]}, expected {config.WATER_HISTORY}")
        if weights is None:
            half = abs(float(depth["lat"][1] - depth["lat"][0])) / 2
            lat_b = np.stack([depth["lat"].values - half, depth["lat"].values + half], axis=1)
            lon_b = np.stack([depth["lon"].values - half, depth["lon"].values + half], axis=1)
            weights = cell_weights(lat_b, lon_b, basins[["id", "geometry"]])
        # depth (m a year; the files say m.month-1, see config.WWM_DIR) × area (km²) / 1000 = km³
        out[sector] = np.einsum("rij,tij->rt", weights.values, np.nan_to_num(depth.values)) / 1000
    return out


def series(values: np.ndarray, years: np.ndarray, scale: float, decimals: int) -> dict:
    in_norm = (years >= config.WATER_NORM[0]) & (years <= config.WATER_NORM[1])
    return {
        "norm": round(float(values[in_norm].mean()) * scale, decimals),
        "history": [round(float(v) * scale, decimals) for v in values],
        "future": {},
    }


def main() -> None:
    basins = ukraine_basins()
    ids = list(basins["id"])
    years = np.arange(config.WATER_HISTORY[0], config.WATER_HISTORY[1] + 1)

    views = {}
    for view, (files, scale, unit, decimals) in VIEWS.items():
        raw = volumes(basins, files)
        sectors = {}
        for sector, source in SECTORS.items():
            values = raw[source]
            sectors[sector] = {
                "country": series(values.sum(axis=0), years, scale, decimals),
                "regions": {basin_id: series(values[i], years, scale, decimals) for i, basin_id in enumerate(ids)},
            }
        views[view] = {"unit": unit, "sectors": sectors}
        total = raw["total"].sum(axis=0)
        print(f"{view}: Ukraine {years[0]} {total[0] * scale:.2f}, {years[-1]} {total[-1] * scale:.2f} {unit}")

    data = {
        "history": {"from": int(years[0]), "to": int(years[-1])},
        "norm": {"from": config.WATER_NORM[0], "to": config.WATER_NORM[1]},
        "views": views,
        "source": config.WWM_SOURCE,
    }
    size = write_json(config.WATER_USE_PATH, data)
    print(f"water-use: {len(ids)} basins, {size // 1024} KB")


if __name__ == "__main__":
    main()
