"""Writes public/data/river-lines.geojson: Natural Earth 1:10m rivers cut along Ukraine's border,
each line running downstream, split into runs that a river station tints.

Properties: `major` (a Natural Earth main river line; otherwise a European supplement tributary,
drawn first so main lines cover it), and on runs within RIVER_REACH_KM of a station along the
river, `tintId` (the nearest station by river distance) and `tintStep` (0 at the station,
RIVER_FADE_STEPS - 1 farthest). The border is the union of oblasts.geojson, the one the map draws,
so run `build_oblasts.py` first. Outlets come from the Open-Meteo Elevation API, cached in
data/raw/rivers/elevation.json.
"""

import heapq
import json
import math
import time
import urllib.parse

import shapely
from shapely.geometry import LineString, Point, shape
from shapely.ops import split

import config
from common import download, write_json
from fetch_rivers import fetch

KM_PER_DEGREE = 111.32
ELEVATION_CACHE = config.RIVERS_DIR / "elevation.json"

Position = tuple[float, float]


def key(p: Position) -> str:
    return f"{p[0]},{p[1]}"


def lines_of(geometry: dict) -> list[list[Position]]:
    if geometry["type"] == "LineString":
        return [[tuple(p[:2]) for p in geometry["coordinates"]]]
    if geometry["type"] == "MultiLineString":
        return [[tuple(p[:2]) for p in line] for line in geometry["coordinates"]]
    return []


def clip_to_box(line: list[Position]) -> list[list[Position]]:
    """Runs that touch the box, each keeping one point beyond it so it reaches the box edge."""
    west, south, east, north = config.RIVER_LINES_BOX

    def inside(p: Position) -> bool:
        return west <= p[0] <= east and south <= p[1] <= north

    runs: list[list[Position]] = []
    run: list[Position] = []
    for i, p in enumerate(line):
        if inside(p) or (i > 0 and inside(line[i - 1])) or (i < len(line) - 1 and inside(line[i + 1])):
            run.append(p)
        elif run:
            runs.append(run)
            run = []
    if run:
        runs.append(run)
    return [r for r in runs if len(r) >= 2]


def clip_to_border(line: list[Position], outline: shapely.Geometry) -> list[list[Position]]:
    """Pieces inside the border, plus pieces outside whose both ends lie near it: rivers that
    form the border (the Danube, the Prut) run beside the border line rather than on it."""
    boundary = outline.boundary
    tolerance = config.RIVER_LINES_BORDER_TOLERANCE
    runs: list[list[Position]] = []
    run: list[Position] = []
    for piece in split(LineString(line), boundary).geoms:
        coords = [tuple(p) for p in piece.coords]
        middle = piece.interpolate(0.5, normalized=True)
        near = all(boundary.distance(Point(p)) <= tolerance for p in (coords[0], coords[-1]))
        if outline.contains(middle) or near:
            run.extend(coords if not run else coords[1:])
        elif run:
            runs.append(run)
            run = []
    if run:
        runs.append(run)
    return runs


def round_line(line: list[Position]) -> list[Position]:
    """Rounds to RIVER_LINES_DIGITS and drops points that collapse onto their predecessor."""
    rounded: list[Position] = []
    for lon, lat in line:
        p = (round(lon, config.RIVER_LINES_DIGITS), round(lat, config.RIVER_LINES_DIGITS))
        if not rounded or rounded[-1] != p:
            rounded.append(p)
    return rounded


def prepare(line: list[Position], outline: shapely.Geometry) -> list[list[Position]]:
    lines = []
    for part in clip_to_box(line):
        simple = LineString(part).simplify(config.RIVER_LINES_TOLERANCE, preserve_topology=False)
        for piece in clip_to_border([tuple(p) for p in simple.coords], outline):
            rounded = round_line(piece)
            if len(rounded) >= 2:
                lines.append(rounded)
    return lines


def loose_ends(lines: list[list[Position]]) -> list[Position]:
    """Line ends no other line touches: sources and mouths, the only candidate outlets."""
    degree: dict[str, int] = {}
    for line in lines:
        for end in (line[0], line[-1]):
            degree[key(end)] = degree.get(key(end), 0) + 1
    ends = {key(end): end for line in lines for end in (line[0], line[-1]) if degree[key(end)] == 1}
    return list(ends.values())


def elevations(points: list[Position]) -> dict[str, float]:
    cache = json.loads(ELEVATION_CACHE.read_text()) if ELEVATION_CACHE.exists() else {}
    missing = [p for p in points if key(p) not in cache]
    for i in range(0, len(missing), config.ELEVATION_BATCH):
        batch = missing[i : i + config.ELEVATION_BATCH]
        query = urllib.parse.urlencode(
            {"latitude": ",".join(str(p[1]) for p in batch), "longitude": ",".join(str(p[0]) for p in batch)}
        )
        heights = json.loads(fetch(f"{config.ELEVATION_API_URL}?{query}"))["elevation"]
        cache.update({key(p): h for p, h in zip(batch, heights)})
        time.sleep(0.3)
    if missing:
        ELEVATION_CACHE.parent.mkdir(parents=True, exist_ok=True)
        ELEVATION_CACHE.write_text(json.dumps(cache))
    return {key(p): cache[key(p)] for p in points}


def orient_downstream(lines: list[list[Position]], elevation: dict[str, float]) -> list[list[Position]]:
    """Reverses lines so each runs downstream, so the map's flow animation (which follows the
    drawing direction) moves with the current. Lines join where they share an endpoint exactly;
    in every connected network the lowest loose end is the outlet: the sea, or the point where
    the river leaves the clipped area."""
    result = [list(line) for line in lines]
    touching: dict[str, list[int]] = {}
    for i, line in enumerate(lines):
        for end in (line[0], line[-1]):
            touching.setdefault(key(end), []).append(i)

    def other_end(i: int, k: str) -> str:
        return key(lines[i][-1]) if key(lines[i][0]) == k else key(lines[i][0])

    seen: set[int] = set()
    for start in range(len(lines)):
        if start in seen:
            continue
        network, stack = [], [start]
        seen.add(start)
        while stack:
            i = stack.pop()
            network.append(i)
            for end in (lines[i][0], lines[i][-1]):
                for j in touching[key(end)]:
                    if j not in seen:
                        seen.add(j)
                        stack.append(j)
        candidates = [key(end) for i in network for end in (lines[i][0], lines[i][-1]) if key(end) in elevation]
        if not candidates:
            continue
        outlet = min(candidates, key=lambda k: elevation[k])
        # Walk upstream from the outlet; every line reached through node `k` drains into it.
        visited: set[int] = set()
        queue = [outlet]
        while queue:
            k = queue.pop(0)
            for i in touching[k]:
                if i in visited:
                    continue
                visited.add(i)
                if key(result[i][-1]) != k:
                    result[i].reverse()
                queue.append(other_end(i, k))
    return result


def km(a: Position, b: Position) -> float:
    cos = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((b[0] - a[0]) * cos, b[1] - a[1]) * KM_PER_DEGREE


def project(p: Position, a: Position, b: Position) -> tuple[float, float]:
    """Squared planar distance from `p` to segment a→b, and the projection parameter."""
    cos = math.cos(math.radians(p[1]))
    dx, dy = (b[0] - a[0]) * cos, b[1] - a[1]
    px, py = (p[0] - a[0]) * cos, p[1] - a[1]
    length_sq = dx * dx + dy * dy
    t = 0.0 if length_sq == 0 else max(0.0, min(1.0, (px * dx + py * dy) / length_sq))
    return (px - t * dx) ** 2 + (py - t * dy) ** 2, t


def river_reach(lines: list[list[Position]]) -> list[list[tuple[str, float] | None]]:
    """Per segment of `lines`, the nearest station along the river network and its distance to
    the segment midpoint, km; None beyond RIVER_REACH_KM. Each station snaps to its nearest
    segment within RIVER_SNAP_KM."""
    node_ids: dict[str, int] = {}
    nodes: list[Position] = []
    for line in lines:
        for p in line:
            if key(p) not in node_ids:
                node_ids[key(p)] = len(nodes)
                nodes.append(p)
    line_nodes = [[node_ids[key(p)] for p in line] for line in lines]
    adjacency: list[list[tuple[int, float]]] = [[] for _ in nodes]
    for ids in line_nodes:
        for a, b in zip(ids, ids[1:]):
            length = km(nodes[a], nodes[b])
            adjacency[a].append((b, length))
            adjacency[b].append((a, length))

    max_km = config.RIVER_REACH_KM
    snap_sq = (config.RIVER_SNAP_KM / KM_PER_DEGREE) ** 2
    heap: list[tuple[float, int, int]] = []
    for s, station in enumerate(config.RIVER_STATIONS):
        position = (station.marker[1], station.marker[0])
        best = None
        for line, ids in zip(lines, line_nodes):
            for i in range(1, len(line)):
                d, t = project(position, line[i - 1], line[i])
                if d <= snap_sq and (best is None or d < best[0]):
                    best = (d, t, line[i - 1], line[i], ids[i - 1], ids[i])
        if best is None:
            raise ValueError(f"{station.id}: marker is more than {config.RIVER_SNAP_KM} km from every river line")
        _, t, a, b, ia, ib = best
        length = km(a, b)
        heapq.heappush(heap, (t * length, ia, s))
        heapq.heappush(heap, ((1 - t) * length, ib, s))

    distance = [math.inf] * len(nodes)
    owner = [-1] * len(nodes)
    while heap:
        d, node, s = heapq.heappop(heap)
        if d >= distance[node] or d > max_km:
            continue
        distance[node], owner[node] = d, s
        for nxt, length in adjacency[node]:
            if d + length < distance[nxt]:
                heapq.heappush(heap, (d + length, nxt, s))

    reach = []
    for ids in line_nodes:
        segments: list[tuple[str, float] | None] = []
        for a, b in zip(ids, ids[1:]):
            near = a if distance[a] <= distance[b] else b
            mid = min(distance[a], distance[b]) + km(nodes[a], nodes[b]) / 2
            segments.append(None if owner[near] == -1 or mid > max_km else (config.RIVER_STATIONS[owner[near]].id, mid))
        reach.append(segments)
    return reach


def tint(r: tuple[str, float] | None) -> dict:
    if r is None:
        return {}
    steps = config.RIVER_FADE_STEPS
    return {"tintId": r[0], "tintStep": min(steps - 1, math.floor(r[1] / config.RIVER_REACH_KM * steps))}


def runs(lines: list[list[Position]], major: list[bool]) -> list[dict]:
    """Splits lines where the tinting station or the fade step changes: a date change in the
    timelapse then only recolours runs instead of rebuilding paths."""
    features = []
    for line, is_major, segments in zip(lines, major, river_reach(lines)):
        run, props = [line[0]], tint(segments[0])
        for i in range(1, len(line)):
            p = tint(segments[i - 1])
            if p != props:
                features.append((run, props, is_major))
                run, props = [line[i - 1]], p
            run.append(line[i])
        features.append((run, props, is_major))
    return [
        {
            "type": "Feature",
            "properties": {"major": is_major, **props},
            "geometry": {"type": "LineString", "coordinates": [list(p) for p in run]},
        }
        for run, props, is_major in features
    ]


def main() -> None:
    oblasts = json.loads(config.OBLASTS_PATH.read_text())
    outline = shapely.union_all([shape(f["geometry"]) for f in oblasts["features"]])
    shapely.prepare(outline)
    # Tributaries first: the main lines are drawn over them where the two sources overlap.
    europe, main_lines = (
        json.loads(download(url, config.RAW_DIR / url.rsplit("/", 1)[1]).read_text())
        for url in reversed(config.NATURAL_EARTH_RIVERS_URLS)
    )
    lines: list[list[Position]] = []
    major: list[bool] = []
    for source, is_major in ((europe, False), (main_lines, True)):
        for feature in source["features"]:
            if feature["geometry"] is None:
                continue
            for line in lines_of(feature["geometry"]):
                for piece in prepare(line, outline):
                    lines.append(piece)
                    major.append(is_major)
    lines = orient_downstream(lines, elevations(loose_ends(lines)))
    features = runs(lines, major)
    tinted = {f["properties"]["tintId"] for f in features if "tintId" in f["properties"]}
    untinted = [s.id for s in config.RIVER_STATIONS if s.id not in tinted]
    if untinted:
        raise ValueError(f"Stations that tint no river: {', '.join(untinted)}")
    size = write_json(config.RIVER_LINES_PATH, {"type": "FeatureCollection", "features": features})
    if size > config.RIVER_LINES_MAX_BYTES:
        raise ValueError(f"{config.RIVER_LINES_PATH} is {size} B, over the {config.RIVER_LINES_MAX_BYTES} B budget")
    print(f"Wrote {len(features)} river runs from {len(lines)} lines ({size} B) to {config.RIVER_LINES_PATH}")


if __name__ == "__main__":
    main()
