"""Offline area accounting for aligned JRC YearlyHistory classes (0/1/2/3).

This module does not decode monthly history, infer observation counts, or align
different product versions. Area weights are pixel/zone intersections in m².
"""

import numpy as np
from shapely import area, box, intersection


PROCESSING_VERSION = "surface-water-prototype-1"
# Experimental spatial coverage gates, not a claim of temporal completeness.
PARTIAL_COVERAGE = 0.80
COMPLETE_COVERAGE = 0.95


def intersection_areas(transform, shape, zone):
    """Intersect native, north-up EPSG:6933 pixel boxes with a zone in that CRS.

    No centre-point inclusion or resampling. The caller must verify the CRS.
    Row batching bounds temporary geometry memory independently of raster height.
    """
    if transform.b != 0 or transform.d != 0 or transform.a <= 0 or transform.e >= 0:
        raise ValueError("Expected a north-up raster with positive pixel width")
    if zone.is_empty or not zone.is_valid or zone.geom_type not in {"Polygon", "MultiPolygon"}:
        raise ValueError("Expected a nonempty valid polygon analysis zone")
    height, width = shape
    weights = np.empty(shape, dtype=np.float64)
    x = transform.c + np.arange(width) * transform.a
    for start in range(0, height, 64):
        y = transform.f + np.arange(start, min(start + 64, height)) * transform.e
        cells = box(x[None, :], (y + transform.e)[:, None],
                    (x + transform.a)[None, :], y[:, None])
        weights[start:start + len(y)] = area(intersection(cells, zone))
    return weights


def _inputs(classes, weights):
    classes = np.asarray(classes)
    weights = np.asarray(weights, dtype=np.float64)
    if classes.shape != weights.shape or classes.size == 0:
        raise ValueError("Classes and area weights must have the same nonempty shape")
    if not np.isin(classes, [0, 1, 2, 3]).all():
        raise ValueError("Expected decoded YearlyHistory classes 0, 1, 2, 3")
    if not np.isfinite(weights).all() or (weights < 0).any() or weights.sum() <= 0:
        raise ValueError("Area weights must be finite, nonnegative and have positive total")
    return classes, weights


def _quality(weights, valid):
    zone_area = float(weights.sum())
    valid_area = float(weights[valid].sum())
    coverage = valid_area / zone_area
    status = ("complete" if coverage >= COMPLETE_COVERAGE else
              "partial" if coverage >= PARTIAL_COVERAGE else "suppressed")
    return {
        "zoneM2": zone_area,
        "validM2": valid_area,
        "coverage": coverage,
        "spatialStatus": status,
        "temporalCompleteness": "unknown",
    }


def _totals(classes, weights, valid):
    permanent = float(weights[valid & (classes == 3)].sum())
    seasonal = float(weights[valid & (classes == 2)].sum())
    return {"permanentM2": permanent, "seasonalM2": seasonal,
            "unionM2": permanent + seasonal}


def annual_areas(classes, weights):
    """Standalone observed-class totals; never subtract these to compare years."""
    classes, weights = _inputs(classes, weights)
    valid = classes != 0
    quality = _quality(weights, valid)
    return {**quality, "areas": None if quality["spatialStatus"] == "suppressed"
            else _totals(classes, weights, valid)}


def compare_areas(before, after, weights):
    """Areas on one common valid mask; suppressed pairs have no change numbers."""
    before, weights = _inputs(before, weights)
    after, _ = _inputs(after, weights)
    common = (before != 0) & (after != 0)
    quality = _quality(weights, common)
    if quality["spatialStatus"] == "suppressed":
        return {**quality, "comparison": None}
    water_before = before >= 2
    water_after = after >= 2
    before_areas = _totals(before, weights, common)
    after_areas = _totals(after, weights, common)

    def total(mask):
        return float(weights[common & mask].sum())

    gained = total(~water_before & water_after)
    lost = total(water_before & ~water_after)
    persistent = total(water_before & water_after)
    delta = after_areas["unionM2"] - before_areas["unionM2"]
    tolerance = max(1e-8, quality["zoneM2"] * 1e-12)
    if abs(delta - (gained - lost)) > tolerance:
        raise ValueError("Common-mask area partition failed")
    baseline = before_areas["unionM2"]
    return {**quality, "comparison": {
        "before": before_areas, "after": after_areas,
        "gainedM2": gained, "lostM2": lost, "persistentM2": persistent,
        "permanentToSeasonalM2": total((before == 3) & (after == 2)),
        "seasonalToPermanentM2": total((before == 2) & (after == 3)),
        "deltaM2": delta,
        "deltaPercent": None if baseline == 0 else 100 * delta / baseline,
    }}
