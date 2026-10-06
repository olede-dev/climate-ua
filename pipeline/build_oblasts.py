"""Writes public/data/oblasts.geojson: the 25 regions of SPEC §4.6, clipped to land.

Properties: `id` (Latin slug), `nameUk`, `nameEn`. Shared borders are simplified together, so
neighbours keep meeting without gaps or overlaps.
"""

import json

import shapely

import config
from common import land_regions, write_json

#: ≈10 m: more digits only add bytes.
COORD_DECIMALS = 4

regions = land_regions()
simplified = shapely.coverage_simplify(regions.geometry.values, config.OBLASTS_SIMPLIFY_DEG)
regions = regions.set_geometry(shapely.set_precision(simplified, 10**-COORD_DECIMALS))

features = [
    {
        "type": "Feature",
        "properties": {"id": row.id, "nameUk": row.uk, "nameEn": row.en},
        "geometry": json.loads(shapely.to_geojson(row.geometry)),
    }
    for row in regions.itertuples()
]
size = write_json(config.OBLASTS_PATH, {"type": "FeatureCollection", "features": features})
print(f"Wrote {len(features)} regions ({size // 1024} KB) to {config.OBLASTS_PATH}")
