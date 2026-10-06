"""Downloads, JSON output and the region geometry shared by the build scripts."""

import json
import urllib.request
from pathlib import Path
from typing import Any

import geopandas as gpd

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
