"""Prepare bounded, resumable exact annual exports; no credentials or publication.

The committed oblast geometry defines download coverage, not waterbody zones.
Generated requests and Code Editor scripts stay in ignored raw storage.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from shapely.geometry import box, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent
YEARS = tuple(range(1984, 2025))
VERSION = "national-source-1"
BOUNDARY_ATTRIBUTION = ('Ukraine boundary: geoBoundaries (© OpenStreetMap contributors, '
                        'ODbL-1.0); Natural Earth (public domain)')


def collection(year):
    if type(year) is not int or year not in YEARS:
        raise ValueError("Unsupported annual year")
    if year <= 2015:
        return "JRC/GSW1_4/YearlyHistory"
    suffix = "2016_2021" if year <= 2021 else "2022_2024"
    return "projects/global-surface-water/assets/GSW1_5/YearlyHistory_" + suffix


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def plan(boundary):
    registry = json.loads(boundary.read_text())
    geometries = [shape(f["geometry"]) for f in registry["features"]]
    if not geometries or any(g.is_empty or not g.is_valid or
                             g.geom_type not in {"Polygon", "MultiPolygon"}
                             for g in geometries):
        raise ValueError("Expected valid nonempty country polygons")
    country = unary_union(geometries)
    west, south, east, north = country.bounds
    if not (20 <= west < east <= 42 and 43 <= south < north <= 54):
        raise ValueError("Expected Ukraine geographic coverage, including Crimea")
    chunks = []
    for lat in range(math.floor(south), math.ceil(north)):
        for lon in range(math.floor(west), math.ceil(east)):
            if country.intersection(box(lon, lat, lon + 1, lat + 1)).area > 0:
                chunks.append({"id": f"e{lon}-n{lat}",
                               "downloadEnvelope": [lon, lat, lon + 1, lat + 1]})
    jobs = [{"id": f"{c['id']}-{year}", "chunkId": c["id"], "year": year,
             "file": f"{c['id']}-yearly-{year}.tif", "collection": collection(year),
             "downloadEnvelope": c["downloadEnvelope"]}
            for year in YEARS for c in chunks]
    return {"schemaVersion": 1, "sourceVersion": VERSION, "years": YEARS,
            "product": "YearlyHistory", "band": "waterClass", "crs": "EPSG:4326",
            "attribution": "Source: EC JRC/Google; Pekel et al. (2016), doi:10.1038/nature20584",
            "boundaryFile": boundary.name, "boundarySha256": sha256(boundary),
            "boundaryAttribution": BOUNDARY_ATTRIBUTION,
            "boundaryRole": "Download coverage only; not historical analysis zones",
            "chunks": chunks, "jobs": jobs}


def export_script(requests, batch_id):
    return """/* global ee, Export */
// Generated exact annual exports. Start tasks in the authenticated Code Editor.
// Source: EC JRC/Google; Pekel et al. (2016), doi:10.1038/nature20584.
var requests = REQUESTS
var resolved = {}
requests.forEach(function (r) {
  if (resolved[r.year]) return
  var matches = ee.ImageCollection(r.collection).filter(ee.Filter.or(
    ee.Filter.eq('year', r.year),
    ee.Filter.date(r.year + '-01-01', (r.year + 1) + '-01-01')
  ))
  if (matches.size().getInfo() !== 1) throw new Error('Missing unique annual image ' + r.year)
  var image = ee.Image(matches.first()).select('waterClass')
  resolved[r.year] = {image: image, imageId: image.id().getInfo(), projection: image.projection().getInfo()}
})
var provenance = []
requests.forEach(function (r) {
  var item = resolved[r.year]
  Export.image.toDrive({
    image: item.image.unmask({value: 0, sameFootprint: false}).toUint8(),
    description: r.id, folder: 'climate-ua-surface-water-national',
    fileNamePrefix: r.file.slice(0, -4),
    region: ee.Geometry.Rectangle(r.downloadEnvelope, 'EPSG:4326', false),
    crs: item.projection.crs, crsTransform: item.projection.transform,
    maxPixels: 20000000, fileFormat: 'GeoTIFF',
    formatOptions: {cloudOptimized: true, noData: 0}
  })
  provenance.push(ee.Feature(null, {
    id: r.id, chunkId: r.chunkId, year: r.year, file: r.file,
    collection: r.collection, imageId: item.imageId, band: 'waterClass',
    crs: item.projection.crs, nativeTransform: JSON.stringify(item.projection.transform),
    downloadEnvelope: JSON.stringify(r.downloadEnvelope), missingClass: 0,
    attribution: 'Source: EC JRC/Google',
    citation: 'Pekel et al. (2016), doi:10.1038/nature20584'
  }))
})
Export.table.toDrive({
  collection: ee.FeatureCollection(provenance), folder: 'climate-ua-surface-water-national',
  description: 'provenance-BATCH', fileNamePrefix: 'provenance-BATCH', fileFormat: 'GeoJSON'
})
""".replace("REQUESTS", json.dumps(requests, ensure_ascii=False)).replace("BATCH", batch_id)


def prepare(boundary, output, *, year, offset=0, limit=25, audit=None):
    collection(year)
    if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError("Expected nonnegative offset and batch limit 1–100")
    result = plan(boundary)
    completed = set()
    if audit is not None:
        previous = json.loads(audit.read_text())
        if previous["sourceVersion"] != VERSION or previous["boundarySha256"] != result["boundarySha256"]:
            raise ValueError("Resume audit has incompatible coverage/version")
        for entry in previous["files"]:
            if Path(entry['file']).name != entry['file']:
                raise ValueError('Resume source filename must stay within the download directory')
            source = audit.parent / entry["file"]
            if not source.is_file() or sha256(source) != entry["sha256"]:
                raise ValueError("Resume source checksum mismatch; re-audit downloads")
            completed.add(entry["id"])
    # Stable offsets index the full year's jobs, not the shrinking pending set.
    jobs = [j for j in result["jobs"] if j["year"] == year][offset:offset + limit]
    pending = [j for j in jobs if j["id"] not in completed]
    write_json(output / "requests.json", result)
    target = output / f"exports-{year}-{offset}.js"
    target.write_text(export_script(pending, f"{year}-{offset}"))
    print(f"{len(result['chunks'])} national chunks × {len(YEARS)} years; {len(pending)} pending tasks: {target}")
    return result


def prepare_direct(requests, output):
    template = (ROOT / 'earth_engine_surface_water_direct.js').read_text()
    script = template.replace('NATIONAL_CELLS', json.dumps([
        c['downloadEnvelope'][:2] for c in requests['chunks']]))
    script = script.replace('SUPPORTED_YEARS', json.dumps(requests['years']))
    (output / 'direct-downloads.js').write_text(script)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--boundary", type=Path, default=ROOT.parent / "public/data/oblasts.geojson")
    parser.add_argument("--output", type=Path, default=ROOT / "data/raw/surface-water/national")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--audit", type=Path)
    parser.add_argument("--direct", action='store_true', help='Also generate direct URLs for all supported years')
    args = parser.parse_args()
    result = prepare(args.boundary, args.output, year=args.year, offset=args.offset, limit=args.limit, audit=args.audit)
    if args.direct:
        prepare_direct(result, args.output)
