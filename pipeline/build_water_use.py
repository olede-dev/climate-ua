"""Writes public/data/water-use.json: water demand and the water gap per subbasin and sector, by year.

The figures of the World Water Map (worldwatermap.nationalgeographic.org), read from its own
basin service (`fetch_wwm_basins.py`, HydroBASINS level 7), whose basins are ours. The water gap
there is demand minus withdrawal: the demand renewable water does not meet. A basin across the
border counts by the share of its area in Ukraine, and a fragment joined to a neighbour adds to
it, so the basins add up to the country. Both are in km³.

The projection is the total gap only, for three scenarios; the sectors and demand have none.
The service gives it by year, 2020–2050, as the mean, min and max of the climate models; a
modelled year is one possible year, so it is written as period means (`WATER_FUTURE_PERIODS`)
with the delta method of SPEC §5.2: the observed gap of 2010–2019 plus the models' mean change
from 2020–2029. Their own historical runs are not in the service, so the projection's first
decade stands in for the model baseline. `low` and `high` are the lowest and highest single
year any model gives in the period, shifted the same way: the spread of years and models
together, wider than that of the models' period means, which the service does not hold. A basin
with no projection in the service has none here; the country counts it as unchanged.

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


def in_years(first: int, years: tuple[int, int]) -> slice:
    """Positions of `years` (inclusive) in a yearly series that starts in `first`."""
    return slice(years[0] - first, years[1] - first + 1)


def periods(stats: dict[str, np.ndarray], observed: float, scale: float, decimals: int) -> dict:
    """The projection of one series as period means by the delta method, with the yearly extremes.

    `stats` holds the yearly mean, min and max of the models from `WWM_FUTURE[0]`; `observed` is
    the observed mean over `WATER_OBSERVED_BASE`. A gap is never below zero.
    """
    first = config.WWM_FUTURE[0]
    base = stats["mean"][in_years(first, config.WATER_MODEL_BASE)].mean()
    out = {}
    for name, years in config.WATER_FUTURE_PERIODS.items():
        span = in_years(first, years)
        values = {
            "mean": stats["mean"][span].mean(),
            "low": stats["min"][span].min(),
            "high": stats["max"][span].max(),
        }
        out[name] = {k: round(max(0.0, float(observed + v - base)) * scale, decimals) for k, v in values.items()}
    return out


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

    _, scale, unit, decimals = VIEWS["gap"]
    gap = field(f"{VIEWS['gap'][0]}_total", len(years))
    observed = gap[:, in_years(int(years[0]), config.WATER_OBSERVED_BASE)].mean(axis=1)
    scenarios = {}
    for scenario, prefix in config.WWM_SCENARIOS.items():
        projected = weights @ source[f"{prefix}_mean"].map(lambda text: isinstance(text, str)).to_numpy(float) > 0
        stats = {key: field(f"{prefix}_{key}", future_years) for key in ("mean", "min", "max")}
        scenarios[scenario] = {
            "country": periods({k: v.sum(axis=0) for k, v in stats.items()}, observed.sum(), scale, decimals),
            "regions": {
                basin_id: periods({k: v[i] for k, v in stats.items()}, observed[i], scale, decimals)
                for i, basin_id in enumerate(ids)
                if projected[i]
            },
        }
        country = ", ".join(f"{p} {v['mean']} ({v['low']}–{v['high']})" for p, v in scenarios[scenario]["country"].items())
        print(f"gap {scenario}: Ukraine {country} {unit}; {len(ids) - projected.sum()} basins without a projection")

    data = {
        "history": {"from": int(years[0]), "to": int(years[-1])},
        "norm": {"from": config.WATER_NORM[0], "to": config.WATER_NORM[1]},
        "views": views,
        "projection": {
            "periods": list(config.WATER_FUTURE_PERIODS),
            "base": {"observed": list(config.WATER_OBSERVED_BASE), "model": list(config.WATER_MODEL_BASE)},
            "unit": unit,
            "scenarios": scenarios,
        },
        "source": config.WWM_SOURCE,
    }
    size = write_json(config.WATER_USE_PATH, data)
    print(f"water-use: {len(ids)} basins, {size // 1024} KB")


if __name__ == "__main__":
    main()
