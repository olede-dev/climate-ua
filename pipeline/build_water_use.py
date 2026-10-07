"""Writes public/data/water-use.json: water demand and the water gap per subbasin and sector, by year.

The figures of the World Water Map (worldwatermap.nationalgeographic.org), read from its own
basin service (`fetch_wwm_basins.py`, HydroBASINS level 7), whose basins are ours. The water gap
there is demand minus withdrawal: the demand renewable water does not meet. A basin across the
border counts by the share of its area in Ukraine, and a fragment joined to a neighbour adds to
it, so the basins add up to the country. Both are in km³.

The projection is the total gap only, yearly 2020–2050, for three scenarios (mean, min and max
of the models); the sectors and demand have none.

Run `fetch_wwm_basins.py` and `build_basins.py` first.
"""

import geopandas as gpd
import numpy as np

import config
from common import ukraine_subbasins, write_json

#: Per view: the service field prefix, m³ → the unit written, the unit and the decimals kept.
VIEWS = {
    "demand": ("demand_historical", 1e-9, "km³", 3),
    "gap": ("gap_historical", 1e-9, "km³", 3),
}
#: A level 7 basin that falls in ours by less than this share is a sliver of a misaligned border.
MIN_SHARE = 0.01


def parse(text: str | float | None, years: int) -> np.ndarray:
    """A `|`-joined series; a basin with none (sea, missing; NaN once read) is zeros."""
    if not isinstance(text, str) or not text:
        return np.zeros(years)
    values = np.array([float(v) for v in text.split("|")])
    if len(values) != years:
        raise ValueError(f"Series of {len(values)} values, expected {years}")
    return values


def shares(basins: gpd.GeoDataFrame, source: gpd.GeoDataFrame) -> np.ndarray:
    """Share of each source basin's area inside each of ours: (ours, source)."""
    ours = basins[["id", "geometry"]].to_crs(config.EQUAL_AREA_CRS)
    theirs = source[["geometry"]].to_crs(config.EQUAL_AREA_CRS).reset_index(names="j")
    area = theirs.geometry.area.values
    parts = gpd.overlay(ours, theirs, how="intersection", keep_geom_type=True)
    ids = list(basins["id"])
    out = np.zeros((len(ids), len(source)))
    for part in parts.itertuples():
        out[ids.index(part.id), part.j] += part.geometry.area / area[part.j]
    out[out < MIN_SHARE] = 0
    return out


def series(values: np.ndarray, years: np.ndarray, scale: float, decimals: int) -> dict:
    in_norm = (years >= config.WATER_NORM[0]) & (years <= config.WATER_NORM[1])
    return {
        "norm": round(float(values[in_norm].mean()) * scale, decimals),
        "history": [round(float(v) * scale, decimals) for v in values],
        "future": {},
    }


def band(stats: dict[str, np.ndarray], scale: float, decimals: int) -> dict:
    return {key: [round(float(v) * scale, decimals) for v in values] for key, values in stats.items()}


def main() -> None:
    basins = ukraine_subbasins()
    ids = list(basins["id"])
    source = gpd.read_file(config.WWM_BASINS_PATH)
    weights = shares(basins, source)
    used = weights.sum(axis=0) > 0
    print(f"{used.sum()} of {len(source)} service basins fall in Ukraine")

    years = np.arange(config.WATER_HISTORY[0], config.WATER_HISTORY[1] + 1)
    future_years = config.WWM_FUTURE[1] - config.WWM_FUTURE[0] + 1

    def field(name: str, length: int) -> np.ndarray:
        """(ours, year): the service series summed over our basins by area share."""
        return weights @ np.stack([parse(text, length) for text in source[name]])

    views = {}
    for view, (prefix, scale, unit, decimals) in VIEWS.items():
        sectors = {}
        for sector, suffix in config.WWM_SECTOR_FIELDS.items():
            values = field(f"{prefix}_{suffix}", len(years))
            sectors[sector] = {
                "country": series(values.sum(axis=0), years, scale, decimals),
                "regions": {basin_id: series(values[i], years, scale, decimals) for i, basin_id in enumerate(ids)},
            }
        views[view] = {"unit": unit, "sectors": sectors}
        total = sectors["total"]["country"]["history"]
        print(f"{view}: Ukraine {years[0]} {total[0]}, {years[-1]} {total[-1]} {unit}")

    missing = [str(b) for b, text in zip(source["basinid"], source["A_370_mean"]) if not isinstance(text, str)]
    if any(used[source["basinid"].astype(str).isin(missing).values]):
        print(f"No projection for service basins {', '.join(missing)}: counted as zero")
    _, scale, unit, decimals = VIEWS["gap"]
    scenarios = {}
    for scenario, prefix in config.WWM_SCENARIOS.items():
        stats = {key: field(f"{prefix}_{key}", future_years) for key in ("mean", "min", "max")}
        scenarios[scenario] = {
            "country": band({k: v.sum(axis=0) for k, v in stats.items()}, scale, decimals),
            "regions": {
                basin_id: band({k: v[i] for k, v in stats.items()}, scale, decimals) for i, basin_id in enumerate(ids)
            },
        }
        print(f"gap {scenario}: Ukraine {config.WWM_FUTURE[1]} {scenarios[scenario]['country']['mean'][-1]} {unit}")

    data = {
        "history": {"from": int(years[0]), "to": int(years[-1])},
        "norm": {"from": config.WATER_NORM[0], "to": config.WATER_NORM[1]},
        "views": views,
        "projection": {
            "from": config.WWM_FUTURE[0],
            "to": config.WWM_FUTURE[1],
            "unit": unit,
            "scenarios": scenarios,
        },
        "source": config.WWM_SOURCE,
    }
    size = write_json(config.WATER_USE_PATH, data)
    print(f"water-use: {len(ids)} basins, {size // 1024} KB")


if __name__ == "__main__":
    main()
