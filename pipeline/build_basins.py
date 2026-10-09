"""Writes public/data/basins.geojson: World Water Map subbasins (HydroBASINS level 7) clipped to
Ukraine.

Properties: `id` (the service's basinid), `riverUk` / `riverEn` (the river with the longest course
through the basin, or null; HydroBASINS has no names), `oblasts` (ids of the
oblasts that hold at least `BASIN_OBLAST_MIN_SHARE` of the basin, largest first), `point`
(a [lon, lat] inside the basin, for the hotspot marker) and `kakhovka` (true where the former
Kakhovka Reservoir was). Run `fetch_wwm_basins.py` first.
"""

import json

import geopandas as gpd
import pandas as pd
import shapely

import config
from common import download, land_regions, ukraine_subbasins, write_json

COORD_DECIMALS = 4
MAX_BYTES = 700 * 1024


def rivers() -> gpd.GeoDataFrame:
    frames = []
    for url in config.NATURAL_EARTH_RIVERS_URLS:
        frames.append(gpd.read_file(download(url, config.RAW_DIR / url.rsplit("/", 1)[1]))[["name", "geometry"]])
    lines = pd.concat(frames).dropna(subset=["name"]).cx[20:42, 43:54]
    return lines.dissolve(by="name", as_index=False).to_crs(config.EQUAL_AREA_CRS)


def river_of(basin: shapely.Geometry, lines: gpd.GeoDataFrame) -> tuple[str, str] | tuple[None, None]:
    length = lines.geometry.intersection(basin).length
    if length.max() < config.BASIN_RIVER_MIN_KM * 1000:
        return None, None
    name = lines["name"][length.idxmax()]
    if name not in config.RIVER_NAMES:
        raise ValueError(f"No Ukrainian and English name for the river {name!r}: add it to RIVER_NAMES")
    return config.RIVER_NAMES[name]


def oblasts_of(basin: shapely.Geometry, oblasts: gpd.GeoDataFrame) -> list[str]:
    shares = oblasts.geometry.intersection(basin).area / basin.area
    picked = shares[shares >= config.BASIN_OBLAST_MIN_SHARE].sort_values(ascending=False)
    return [oblasts["id"][i] for i in picked.index]


def kakhovka() -> shapely.Geometry:
    lakes = gpd.read_file(download(config.NATURAL_EARTH_LAKES_URL, config.RAW_DIR / "ne_10m_lakes.geojson"))
    [reservoir] = lakes.loc[lakes["name"] == config.KAKHOVKA_NAME, "geometry"]
    return reservoir


def main() -> None:
    basins = ukraine_subbasins()
    shapes = basins.geometry.to_crs(config.EQUAL_AREA_CRS)
    oblasts = land_regions().to_crs(config.EQUAL_AREA_CRS)
    lines = rivers()
    reservoir = kakhovka()

    simplified = shapely.coverage_simplify(basins.geometry.values, config.BASINS_SIMPLIFY_DEG)
    simplified = shapely.set_precision(simplified, 10**-COORD_DECIMALS)

    features = []
    for i, row in basins.iterrows():
        river_uk, river_en = river_of(shapes[i], lines)
        point = shapely.set_precision(row.geometry.point_on_surface(), 10**-COORD_DECIMALS)
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": row["id"],
                    "riverUk": river_uk,
                    "riverEn": river_en,
                    "oblasts": oblasts_of(shapes[i], oblasts),
                    "point": [point.x, point.y],
                    "kakhovka": bool(row.geometry.intersects(reservoir)),
                },
                "geometry": json.loads(shapely.to_geojson(simplified[i])),
            }
        )
    size = write_json(config.BASINS_PATH, {"type": "FeatureCollection", "features": features})
    named = sum(f["properties"]["riverUk"] is not None for f in features)
    lower_dnipro = [f["properties"]["id"] for f in features if f["properties"]["kakhovka"]]
    print(f"Wrote {len(features)} basins, {named} named after a river ({size // 1024} KB) to {config.BASINS_PATH}")
    print(f"  Kakhovka Reservoir: {', '.join(lower_dnipro)}")
    if size > MAX_BYTES:
        raise ValueError(f"basins.geojson is {size // 1024} KB, over {MAX_BYTES // 1024} KB: simplify more")


if __name__ == "__main__":
    main()
