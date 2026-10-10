"""Audit downloaded national batches; incomplete inputs never certify production."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

from prepare_surface_water_national import VERSION, collection, sha256, write_json


def verified_counts(path):
    counts = np.zeros(4, dtype=np.int64)
    with rasterio.open(path) as source:
        for row in range(0, source.height, 512):
            for col in range(0, source.width, 512):
                window = Window(col, row, min(512, source.width - col), min(512, source.height - row))
                raw = source.read(1, window=window)
                if not np.isin(raw, [0, 1, 2, 3]).all():
                    raise ValueError("Undocumented annual class")
                data = source.read(1, window=window, masked=True).filled(0)
                counts += np.bincount(data.ravel(), minlength=4)
    return counts.tolist(), sha256(path)


def audit(inputs, requests, output, workers=4):
    if type(workers) is not int or not 1 <= workers <= 16:
        raise ValueError("Expected audit workers from 1 to 16")
    plan = json.loads(requests.read_text())
    if plan["schemaVersion"] != 1 or plan["sourceVersion"] != VERSION:
        raise ValueError("Unsupported national source plan")
    jobs = {j["id"]: j for j in plan["jobs"]}
    if len(jobs) != len(plan["jobs"]):
        raise ValueError("Duplicate national source requests")
    expected = {(c["id"], y) for c in plan["chunks"] for y in range(1984, 2025)}
    if len(expected) != len(jobs) or {(j["chunkId"], j["year"]) for j in jobs.values()} != expected:
        raise ValueError("National requests must cover every chunk and all 41 years")
    provenance = {}
    for path in sorted(inputs.glob("provenance-*.geojson")):
        document = json.loads(path.read_text())
        if document["type"] != "FeatureCollection":
            raise ValueError("Expected exported provenance FeatureCollection")
        for feature in document["features"]:
            props = feature["properties"]
            if props["id"] not in jobs or props["id"] in provenance:
                raise ValueError("Unknown or duplicate national provenance")
            provenance[props["id"]] = props
    result = {"schemaVersion": 1, "sourceVersion": VERSION,
              "boundarySha256": plan["boundarySha256"], "requestsSha256": sha256(requests),
              "attribution": plan["attribution"], "files": [], "missing": [],
              "purpose": "Source integrity only; not historical-zone or publication approval"}
    grids = {}
    pending = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for key, job in sorted(jobs.items()):
            if Path(job['file']).name != job['file']:
                raise ValueError('Source filename must stay within the download directory')
            p = provenance.get(key)
            path = inputs / job["file"]
            if p is None or not path.is_file():
                result["missing"].append(key)
                continue
            if (Path(job["file"]).name != job["file"] or
                    p["file"] != job["file"] or p["chunkId"] != job["chunkId"] or
                    p["year"] != job["year"] or p["collection"] != collection(job["year"]) or
                    job["collection"] != p["collection"] or p["band"] != "waterClass" or
                    p["missingClass"] != 0 or not p["imageId"] or
                    json.loads(p["downloadEnvelope"]) != job["downloadEnvelope"]):
                raise ValueError("Unexpected exact annual source provenance")
            native = np.asarray(json.loads(p["nativeTransform"]), dtype=float)
            if (native.shape != (6,) or not np.isfinite(native).all() or
                    native[0] <= 0 or native[4] >= 0 or native[1] != 0 or native[3] != 0):
                raise ValueError("Expected north-up native geographic grid")
            with rasterio.open(path) as source:
                if (p["crs"] != "EPSG:4326" or source.crs != rasterio.crs.CRS.from_epsg(4326) or
                        source.count != 1 or source.dtypes != ("uint8",) or source.nodata != 0 or
                        source.width * source.height > 20000000):
                    raise ValueError("Unexpected annual raster header")
                t = np.asarray(list(source.transform)[:6])
                if (not np.allclose(t[[0, 1, 3, 4]], native[[0, 1, 3, 4]], rtol=0, atol=1e-15) or
                        any(abs(v - round(v)) > 1e-7 for v in
                            ((t[2] - native[2]) / native[0], (t[5] - native[5]) / native[4]))):
                    raise ValueError("Export moved off its native grid")
                west, south, east, north = job["downloadEnvelope"]
                b = source.bounds
                if not (b.left <= west and b.bottom <= south and b.right >= east and b.top >= north):
                    raise ValueError("Export clips its requested national chunk")
                # Source revisions contain harmless 1e-14 degree serialization noise.
                grid = grids.setdefault(job["chunkId"], (source.shape, t))
                if source.shape != grid[0] or not np.allclose(t, grid[1], rtol=0, atol=1e-10):
                    raise ValueError("Incompatible annual grids within a national chunk")
                entry = {**p, "product": "YearlyHistory", "shape": list(source.shape),
                         "transform": t.tolist(), "bytes": path.stat().st_size}
                pending.append((entry, pool.submit(verified_counts, path)))
        for entry, future in pending:
            values, checksum = future.result()
            result["files"].append({**entry, "values": values, "sha256": checksum})
    result["complete"] = not result["missing"]
    write_json(output, result)
    print(f"Audited {len(result['files'])}/{len(jobs)} national inputs; complete={result['complete']}")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--requests", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=range(1, 17), default=4)
    args = parser.parse_args()
    audit(args.inputs, args.requests, args.output, args.workers)
