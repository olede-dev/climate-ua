"""Downloads, JSON output and the region geometry shared by the build scripts."""

import json
import urllib.request
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import xarray as xr
from shapely.geometry import box

import config


def download(url: str, target: Path) -> Path:
    """Downloads `url` once; later runs reuse the file under `data/raw`."""
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {url}")
        urllib.request.urlretrieve(url, target)
    return target


def write_json(path: Path, data: Any) -> int:
    """Compact UTF-8 JSON; returns its size in bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text + "\n", encoding="utf-8")
    return len(text.encode())


def land_regions() -> gpd.GeoDataFrame:
    """The 25 regions of SPEC §4.6, clipped to land, in full detail: `id`, `uk`, `en`, geometry."""
    adm1 = gpd.read_file(download(config.GEOBOUNDARIES_URL, config.RAW_DIR / "geoboundaries-UKR-ADM1.geojson"))
    land = gpd.read_file(download(config.NATURAL_EARTH_UKR_URL, config.RAW_DIR / "ne_10m_admin_0_countries_ukr.geojson"))
    ukraine = land[land["ADM0_A3"] == "UKR"].geometry.union_all()

    unknown = set(adm1["shapeISO"]) - set(config.REGIONS)
    if unknown or len(adm1) != len(config.REGIONS):
        raise ValueError(f"geoBoundaries regions changed: unknown {sorted(unknown)}, {len(adm1)} in total")

    adm1["id"] = adm1["shapeISO"].map(lambda iso: config.REGIONS[iso].id)
    merged = adm1[["id", "geometry"]].dissolve(by="id", as_index=False)
    merged["geometry"] = merged.geometry.intersection(ukraine).make_valid()
    names = {r.id: r for r in config.REGIONS.values()}
    merged["uk"] = merged["id"].map(lambda i: names[i].uk)
    merged["en"] = merged["id"].map(lambda i: names[i].en)
    return merged[["id", "uk", "en", "geometry"]].sort_values("id").reset_index(drop=True)


def ukraine_outline():
    """Ukraine on land, as the union of the regions: basins end where the oblasts do."""
    return land_regions().geometry.union_all()


def cell_weights(lat_bnds: np.ndarray, lon_bnds: np.ndarray, shapes: gpd.GeoDataFrame) -> xr.DataArray:
    """Area (km²) each grid cell shares with each shape (`id` column): dims (region, lat, lon).

    `lat_bnds` and `lon_bnds` are (n, 2) cell edges in degrees.
    """
    cells = gpd.GeoDataFrame(
        {"i": np.repeat(np.arange(len(lat_bnds)), len(lon_bnds)), "j": np.tile(np.arange(len(lon_bnds)), len(lat_bnds))},
        geometry=[box(lo[0], la[0], lo[1], la[1]) for la in lat_bnds for lo in lon_bnds],
        crs="EPSG:4326",
    ).to_crs(config.EQUAL_AREA_CRS)
    parts = gpd.overlay(cells, shapes[["id", "geometry"]].to_crs(config.EQUAL_AREA_CRS), how="intersection", keep_geom_type=True)

    ids = list(shapes["id"])
    weights = np.zeros((len(ids), len(lat_bnds), len(lon_bnds)))
    for part in parts.itertuples():
        weights[ids.index(part.id), part.i, part.j] += part.geometry.area / 1e6
    return xr.DataArray(weights, dims=("region", "lat", "lon"), coords={"region": ids})


def _absorb_fragments(basins: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Joins each basin with less than BASIN_MIN_KM2 in Ukraine to the neighbour it shares the
    longest border with (or the nearest one), smallest first. The neighbour keeps its own data."""
    basins = basins.copy()
    shapes = basins.geometry.to_crs(config.EQUAL_AREA_CRS)
    area = shapes.area / 1e6
    small = list(area[area < config.BASIN_MIN_KM2].sort_values().index)
    hosts = shapes.drop(index=small)
    for index in small:
        piece = shapes[index]
        border = hosts.boundary.intersection(piece.boundary).length
        host = border.idxmax() if border.max() > 0 else hosts.distance(piece).idxmin()
        hosts[host] = hosts[host].union(piece)
        basins.loc[host, "geometry"] = basins.geometry[host].union(basins.geometry[index])
    return basins.drop(index=small)


def ukraine_subbasins() -> gpd.GeoDataFrame:
    """World Water Map basins (HydroBASINS level 7) that reach Ukraine: the map's regions.

    Columns: `id` (the service's `basinid` as text), `geometry` (the part in Ukraine, small
    fragments joined to a neighbour) and `full` (the whole basin). Run `fetch_wwm_basins.py` first.
    """
    outline = ukraine_outline()
    basins = gpd.read_file(config.WWM_BASINS_PATH)[["basinid", "geometry"]]
    basins["geometry"] = basins.geometry.make_valid()
    basins = basins[basins.intersects(outline)].copy()
    basins["id"] = basins["basinid"].astype(int).astype(str)
    if basins["id"].duplicated().any():
        raise ValueError("World Water Map basins are not unique by basinid")
    basins["full"] = basins.geometry
    basins["geometry"] = basins.geometry.intersection(outline).make_valid()
    basins = basins[~basins.geometry.is_empty]
    basins = _absorb_fragments(basins)
    return basins[["id", "geometry", "full"]].sort_values("id").reset_index(drop=True)
