"""Explicit, bounded source retrieval; never used by routine verification.

Reads 32×32 native-resolution windows at reference points, not analysis zones.
Raw crops and the manifest stay under pipeline/data/raw/surface-water/.
--prototype-inputs downloads full native windows inside historical envelopes.
"""

import argparse
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.request import urlopen

import numpy as np
import rasterio
from rasterio.windows import Window, from_bounds

from config import RAW_DIR


ARCHIVE = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GSWE/YearlyClassification/VER5-0/tiles/"
STORE = "https://s3.waw4-1.cloudferro.com/swift/v1/global-surface-water/"
REFERENCE_POINTS = {
    # Interior representative points of Natural Earth v5.1.2 historical polygons.
    "kakhovka": (34.06753603965993, 47.3428435),
    "kremenchuk": (32.726445341813346, 49.28756),
    "svitiaz": (23.85, 51.49),
}
# Download envelopes include historical reservoir polygons; they are NOT the
# eventual analysis zones and include dry land/possibly neighbouring water.
DOWNLOAD_ENVELOPES = {
    "kakhovka": (33.52, 46.81, 35.35, 47.87),
    "kremenchuk": (31.35, 48.9, 33.3, 49.85),
    "svitiaz": (23.75, 51.44, 23.92, 51.54),
}


@lru_cache(maxsize=3)
def annual_files(year):
    with urlopen(ARCHIVE + f"yearlyClassification{year}/", timeout=30) as response:
        listing = response.read().decode()
    return re.findall(r'href="(yearlyClassification[^"/]+\.tif)"', listing)


def source_url(product, year, month, lon, lat):
    if product == "yearly":
        # Archive tiles are global pixel offsets from (-180, 80), at 0.00025°.
        row = int((80 - lat) // 10) * 40000
        col = int((lon + 180) // 10) * 40000
        suffix = f"{row:010d}-{col:010d}.tif"
        matches = [name for name in annual_files(year) if name.endswith(suffix)]
        if len(matches) != 1:
            raise ValueError(f"Expected one published annual tile for {year}, {suffix}")
        filename = matches[0]
        return ARCHIVE + f"yearlyClassification{year}/" + filename
    west, north = int(lon // 10) * 10, (int(lat // 10) + 1) * 10
    if product == "seasonality":
        filename = f"seasonality_{west}E_{north}N_v1_5_{year}.tif"
        return STORE + "download2024/Aggregated/VER1-5/seasonality/" + filename
    filename = f"monthlyhistory_{west}E_{north}N_v1_5_{year}_{month:02d}.tif"
    return STORE + f"download2024/monthlyhistory/VER1-5/{year}/{year}_{month:02d}/" + filename


def audit(output):
    output.mkdir(parents=True, exist_ok=True)
    manifest = {
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "Point-window source availability audit, not waterbody area validation",
        "pointProvenance": {
            "reservoirs": "Natural Earth v5.1.2 ne_10m_lakes interior representative points",
            "svitiaz": "Reference coordinate; not a catalogued boundary",
        },
        "attribution": "Source: EC JRC/Google",
        "samples": [],
    }
    # Query both source families explicitly: absence is recorded, not fabricated.
    for prefix in ["download2024/Year", "YearlyClassification", "download2024/yearly"]:
        url = STORE + "?prefix=" + prefix + "&limit=100"
        with urlopen(url, timeout=30) as response:
            listing = response.read().decode()
        manifest.setdefault("annualListingProbes", []).append({"url": url, "listing": listing})
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="30",
                      GDAL_TIFF_INTERNAL_MASK=True):
        requests = [("yearly", year, None) for year in (1984, 2015, 2021)]
        requests += [("monthly", year, month) for year in (2022, 2023, 2024) for month in (1, 7)]
        for product, year, month in requests:
            for name, (lon, lat) in REFERENCE_POINTS.items():
                url = source_url(product, year, month, lon, lat)
                started = time.perf_counter()
                with rasterio.open(url) as source:
                    row, col = source.index(lon, lat)
                    window = Window(col - 16, row - 16, 32, 32)
                    data = source.read(1, window=window)
                    if data.shape != (32, 32):
                        raise ValueError("Reference window crossed the source tile boundary")
                    allowed = [0, 1, 2, 3] if product == "yearly" else [0, 1, 2]
                    if not np.isin(data, allowed).all():
                        raise ValueError(f"Undocumented source classes in {url}")
                    transform = source.window_transform(window)
                    filename = f"{name}-{product}-{year}-{month or 'annual'}.tif"
                    crop = output / filename
                    profile = {"driver": "GTiff", "dtype": data.dtype, "count": 1,
                               "width": 32, "height": 32, "crs": source.crs,
                               "transform": transform}
                    with rasterio.open(crop, "w", **profile) as destination:
                        destination.write(data, 1)
                        destination.write_mask(source.read_masks(1, window=window))
                    values, counts = np.unique(data, return_counts=True)
                    sample = {
                        "waterbodyId": name, "point": [lon, lat],
                        "product": "YearlyClassification" if product == "yearly" else "MonthlyHistory",
                        "distribution": "archive VER5-0 (through 2021)" if product == "yearly" else "GSW v1.5",
                        "year": year, "month": month, "url": url,
                        "crs": source.crs.to_string(), "sourceShape": list(source.shape),
                        "pixelSizeDegrees": [source.transform.a, -source.transform.e],
                        "cropTransform": list(transform)[:6], "crop": filename,
                        "cropSha256": hashlib.sha256(crop.read_bytes()).hexdigest(),
                        "pixelSha256": hashlib.sha256(data.tobytes()).hexdigest(),
                        "values": dict(zip(map(str, values.tolist()), counts.tolist())),
                        "readSeconds": round(time.perf_counter() - started, 3),
                    }
                manifest["samples"].append(sample)
                # Preserve completed evidence even if a later network read fails.
                (output / "audit.json").write_text(json.dumps(manifest, indent=2) + "\n")
                print(f"{name} {product} {year} {month or ''}: {sample['values']}", flush=True)
    return manifest


def fetch_inputs(output):
    """Fetch full native classified/observation inputs for the three envelopes.

    Keep products separate. Seasonality 2024 is not silently decoded as annual
    classes, and monthly observations are not silently reduced to YearlyHistory.
    """
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "inputs.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"files": []}
    old_files = {entry["file"]: entry for entry in previous["files"]}
    manifest = {
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "Native source crops inside download envelopes; not analysis zones",
        "attribution": "Source: EC JRC/Google", "files": [],
    }
    requests = [("yearly", year, None) for year in (1984, 2015, 2021)]
    requests += [("seasonality", 2024, None)]
    requests += [("monthly", year, month) for year in (2022, 2023, 2024) for month in range(1, 13)]
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="30",
                      GDAL_TIFF_INTERNAL_MASK=True):
        for product, year, month in requests:
            for name, bounds in DOWNLOAD_ENVELOPES.items():
                lon, lat = REFERENCE_POINTS[name]
                url = source_url(product, year, month, lon, lat)
                filename = f"{name}-{product}-{year}-{month or 'annual'}.tif"
                path = output / filename
                old = old_files.get(filename)
                if old and old["url"] == url and path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == old["sha256"]:
                    manifest["files"].append(old)
                    print(f"Reuse {filename}", flush=True)
                else:
                    started = time.perf_counter()
                    with rasterio.open(url) as source:
                        # Snap outwards to complete native pixels, never interpolate.
                        fractional = from_bounds(*bounds, transform=source.transform)
                        col = int(np.floor(fractional.col_off))
                        row = int(np.floor(fractional.row_off))
                        width = int(np.ceil(fractional.col_off + fractional.width)) - col
                        height = int(np.ceil(fractional.row_off + fractional.height)) - row
                        if col < 0 or row < 0 or col + width > source.width or row + height > source.height:
                            raise ValueError(f"Envelope crosses a source tile: {name}")
                        window = Window(col, row, width, height)
                        data = source.read(1, window=window)
                        allowed = range(13) if product == "seasonality" else ([0, 1, 2, 3] if product == "yearly" else [0, 1, 2])
                        if not np.isin(data, list(allowed) + ([255] if product == "seasonality" else [])).all():
                            raise ValueError(f"Undocumented classes in {url}")
                        profile = {"driver": "GTiff", "dtype": data.dtype, "count": 1,
                                   "width": width, "height": height, "crs": source.crs,
                                   "transform": source.window_transform(window),
                                   "compress": "deflate", "tiled": True}
                        # Atomic replacement makes interrupted downloads resumable.
                        temporary = path.with_suffix(".part.tif")
                        with rasterio.open(temporary, "w", **profile) as destination:
                            destination.write(data, 1)
                            destination.write_mask(source.read_masks(1, window=window))
                        temporary.replace(path)
                        values, counts = np.unique(data, return_counts=True)
                        entry = {
                            "waterbodyId": name, "product": product, "year": year, "month": month,
                            "distribution": "archive VER5-0" if product == "yearly" else "GSW v1.5",
                            "url": url, "downloadEnvelope": list(bounds), "file": filename,
                            "crs": source.crs.to_string(), "transform": list(profile["transform"])[:6],
                            "shape": list(data.shape), "values": dict(zip(map(str, values.tolist()), counts.tolist())),
                            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
                            "readSeconds": round(time.perf_counter() - started, 3),
                        }
                    manifest["files"].append(entry)
                    print(f"Downloaded {filename}: {entry['bytes']} bytes", flush=True)
                manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=RAW_DIR / "surface-water/source-audit")
    parser.add_argument("--evidence", type=Path, help="Also write the completed JSON manifest here")
    parser.add_argument("--prototype-inputs", action="store_true", help="Download complete native windows and all 2022–2024 months inside the three envelopes")
    args = parser.parse_args()
    manifest = fetch_inputs(args.output / "inputs") if args.prototype_inputs else audit(args.output)
    if args.evidence:
        args.evidence.parent.mkdir(parents=True, exist_ok=True)
        args.evidence.write_text(json.dumps(manifest, indent=2) + "\n")
