"""Simplifies public/data/hidden-labels.geojson, the mask of foreign land whose basemap labels
the map hides.

The mask sits in every label layer's filter, so its size costs main-thread time on each style
load. Only labels near Ukraine matter: the mask keeps its shape within NEAR_DEG of Ukraine and is
reduced to a coarse outline, without small islands, everywhere else.
"""

import json

import shapely

import config
from common import write_json

PATH = config.PUBLIC_DATA / "hidden-labels.geojson"
NEAR_DEG = 1.0
FAR_SIMPLIFY_DEG = 0.3
FAR_MIN_AREA = 1.0
COORD_DECIMALS = 4

mask = shapely.make_valid(shapely.from_geojson(PATH.read_text(encoding="utf-8")))
oblasts = json.loads(config.OBLASTS_PATH.read_text(encoding="utf-8"))["features"]
ukraine = shapely.union_all([shapely.from_geojson(json.dumps(f["geometry"])) for f in oblasts])
near = ukraine.buffer(NEAR_DEG)

far = mask.difference(near).simplify(FAR_SIMPLIFY_DEG)
far = [part for part in getattr(far, "geoms", [far]) if part.area >= FAR_MIN_AREA]
kept = shapely.union_all([mask.intersection(near), *far])
kept = shapely.set_precision(kept, 10**-COORD_DECIMALS)
polygons = [p for p in getattr(kept, "geoms", [kept]) if p.geom_type == "Polygon"]
result = shapely.MultiPolygon(polygons)

before = shapely.get_num_coordinates(mask)
geometry = json.loads(shapely.to_geojson(result))
size = write_json(PATH, {"type": "Feature", "properties": {}, "geometry": geometry})
print(f"{before} -> {shapely.get_num_coordinates(result)} points ({size // 1024} KB) in {PATH}")
