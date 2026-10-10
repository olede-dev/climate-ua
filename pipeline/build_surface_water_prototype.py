"""Offline diagnostics for acquired prototype envelopes, not waterbody zones.

Retain actual source classes and GDAL masks. No monthly-to-annual classifier,
release merging, catalogue or publishable assets are produced by this command.
Run from the repository root; all raw inputs and outputs remain ignored.
"""

import argparse
import hashlib
from itertools import combinations
import json
from pathlib import Path
import time

import rasterio
from shapely.geometry import box

from config import RAW_DIR
from surface_water import GEOGRAPHIC_TO_AREA, PROCESSING_VERSION, raster_areas


def build(inputs, output):
    manifest = json.loads((inputs / "inputs.json").read_text())
    groups = {}
    for entry in manifest["files"]:
        if entry["product"] != "yearly":
            continue
        path = inputs / entry["file"]
        if path.resolve().parent != inputs.resolve():
            raise ValueError("Source crop must be directly inside the input directory")
        with path.open("rb") as source:
            checksum = hashlib.file_digest(source, "sha256").hexdigest()
        if checksum != entry["sha256"]:
            raise ValueError(f"Source crop checksum mismatch: {entry['file']}")
        with rasterio.open(path) as source:
            if (source.crs.to_string() != entry["crs"] or list(source.shape) != entry["shape"]
                    or list(source.transform)[:6] != entry["transform"]):
                raise ValueError(f"Source crop header does not match provenance: {entry['file']}")
        groups.setdefault(entry["waterbodyId"], []).append(entry)
    if not groups:
        raise ValueError("No acquired annual source crops in the input manifest")
    result = {
        "purpose": "Download-envelope diagnostics, NOT catalogued waterbody areas or production assets",
        "processingVersion": PROCESSING_VERSION,
        "unit": "m2",
        "areaCRS": "EPSG:6933",
        "areaMethod": "Native EPSG:4326 cell-edge projection and polygon intersections; no raster resampling",
        "sourceAttribution": manifest["attribution"],
        "citation": "Pekel et al. (2016), Nature 540, 418–422, doi:10.1038/nature20584",
        "sourceCompatibility": "Unverified; do not use as production supported-year evidence",
        "envelopes": [],
    }
    timings = []
    for waterbody_id, entries in sorted(groups.items()):
        entries.sort(key=lambda entry: entry["year"])
        years = [entry["year"] for entry in entries]
        if len(set(years)) != len(years):
            raise ValueError(f"Duplicate annual year for {waterbody_id}")
        bounds = entries[0]["downloadEnvelope"]
        if any(entry["downloadEnvelope"] != bounds for entry in entries):
            raise ValueError(f"Inconsistent envelope for {waterbody_id}")
        if len({entry["distribution"] for entry in entries}) != 1:
            raise ValueError("Cross-distribution annual comparisons require separate compatibility evidence")
        west, south, east, north = bounds
        x0, y0 = GEOGRAPHIC_TO_AREA.transform(west, south, errcheck=True)
        x1, y1 = GEOGRAPHIC_TO_AREA.transform(east, north, errcheck=True)
        zone = box(x0, y0, x1, y1)
        envelope = {"candidateId": waterbody_id, "bounds": bounds, "annual": [], "pairs": []}
        started = time.perf_counter()
        for entry in entries:
            annual = raster_areas(inputs / entry["file"], zone, product="YearlyClassification")
            envelope["annual"].append({"year": entry["year"], "source": entry, **annual})
        for before, after in combinations(entries, 2):
            comparison = raster_areas(inputs / before["file"], zone, product="YearlyClassification",
                                      after=inputs / after["file"])
            envelope["pairs"].append({"beforeYear": before["year"], "afterYear": after["year"],
                                      **comparison})
        result["envelopes"].append(envelope)
        timings.append({"candidateId": waterbody_id, "seconds": time.perf_counter() - started})
        print(f"Processed {waterbody_id}: {years}", flush=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Stable scientific output; runtime measurements are returned separately.
    text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    temporary = output.with_suffix(output.suffix + ".part")
    temporary.write_text(text)
    temporary.replace(output)
    return timings


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, default=RAW_DIR / "surface-water/source-audit/inputs")
    parser.add_argument("--output", type=Path, default=RAW_DIR / "surface-water/prototype/envelope-areas.json")
    args = parser.parse_args()
    for timing in build(args.inputs, args.output):
        print(f"{timing['candidateId']}: {timing['seconds']:.3f} s", flush=True)
