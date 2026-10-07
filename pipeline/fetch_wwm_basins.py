"""Downloads the World Water Map basin service (`config.WWM_BASINS_URL`) around Ukraine.

One GeoJSON of the HydroBASINS level 7 basins that touch Ukraine's bounding box, with every
historical series and the projection; `build_water_use.py` reads it.
"""

import json
import urllib.parse
import urllib.request

import config
from common import ukraine_outline

#: Bounding-box margin, degrees: basins across the border are kept whole.
MARGIN = 0.5


def fields() -> list[str]:
    names = ["basinid"]
    for sector in config.WWM_SECTOR_FIELDS.values():
        names += [f"demand_historical_{sector}", f"gap_historical_{sector}"]
    for prefix in config.WWM_SCENARIOS.values():
        names += [f"{prefix}_mean", f"{prefix}_min", f"{prefix}_max"]
    return names


def main() -> None:
    x0, y0, x1, y1 = ukraine_outline().bounds
    query = {
        "f": "geojson",
        "geometry": f"{x0 - MARGIN},{y0 - MARGIN},{x1 + MARGIN},{y1 + MARGIN}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": 4326,
        "outSR": 4326,
        "outFields": ",".join(fields()),
        "returnGeometry": "true",
        "resultRecordCount": 2000,
    }
    with urllib.request.urlopen(f"{config.WWM_BASINS_URL}?{urllib.parse.urlencode(query)}") as response:
        data = json.load(response)
    if "features" not in data:
        raise ValueError(f"Service error: {data}")
    if data.get("properties", {}).get("exceededTransferLimit") or data.get("exceededTransferLimit"):
        raise ValueError("The service cut the result short; page through it")
    config.WWM_BASINS_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.WWM_BASINS_PATH.write_text(json.dumps(data), encoding="utf-8")
    print(f"Wrote {len(data['features'])} basins to {config.WWM_BASINS_PATH}")


if __name__ == "__main__":
    main()
