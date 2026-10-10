"""Offline area accounting for aligned JRC YearlyHistory classes (0/1/2/3).

This module does not decode monthly history, infer observation counts, or align
different product versions. Area weights are pixel/zone intersections in m².
"""

from contextlib import ExitStack

import numpy as np
from pyproj import Transformer
import rasterio
from rasterio.windows import Window
from shapely import area, box, intersection


PROCESSING_VERSION = "surface-water-prototype-1"
# Experimental spatial coverage gates, not a claim of temporal completeness.
PARTIAL_COVERAGE = 0.80
COMPLETE_COVERAGE = 0.95
GEOGRAPHIC_TO_AREA = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)


def geographic_intersection_areas(transform, shape, zone, *, row_off=0, col_off=0):
    """Native EPSG:4326 cells intersected with a supplied EPSG:6933 zone.

    EPSG:6933 is cylindrical equal-area: meridians and parallels project to
    straight cell edges. Transform the edges, never resample categorical data.
    The caller verifies raster CRS and projects/densifies its zone separately.
    """
    if transform.b != 0 or transform.d != 0 or transform.a <= 0 or transform.e >= 0:
        raise ValueError("Expected a north-up geographic raster")
    if zone.is_empty or not zone.is_valid or zone.geom_type not in {"Polygon", "MultiPolygon"}:
        raise ValueError("Expected a nonempty valid EPSG:6933 polygon analysis zone")
    height, width = shape
    if height <= 0 or width <= 0:
        raise ValueError("Expected a nonempty raster window")
    # Keep adjacent block edges identical instead of adding window origins and
    # pixel offsets in different floating-point orders.
    lons = transform.c + (col_off + np.arange(width + 1)) * transform.a
    lats = transform.f + (row_off + np.arange(height + 1)) * transform.e
    if (not np.isfinite(lons).all() or not np.isfinite(lats).all()
            or lons.min() < -180 or lons.max() > 180
            or lats.min() < -86 or lats.max() > 86):
        raise ValueError("Raster window exceeds the geographic EPSG:6933 domain")
    x, _ = GEOGRAPHIC_TO_AREA.transform(lons, np.zeros_like(lons), errcheck=True)
    _, y = GEOGRAPHIC_TO_AREA.transform(np.zeros_like(lats), lats, errcheck=True)
    weights = np.empty(shape, dtype=np.float64)
    for start in range(0, height, 64):
        stop = min(start + 64, height)
        if zone.covers(box(x[0], y[stop], x[-1], y[start])):
            weights[start:stop] = (y[start:stop] - y[start + 1:stop + 1])[:, None] * np.diff(x)[None, :]
            continue
        cells = box(x[:-1][None, :], y[start + 1:stop + 1, None],
                    x[1:][None, :], y[start:stop, None])
        weights[start:stop] = area(intersection(cells, zone))
    return weights


def raster_areas(before, zone, *, product, after=None, block_size=256):
    """Bounded native-grid annual or common-mask accounting for local rasters.

    `zone` is in EPSG:6933; all of it must be covered by the input extent.
    Product provenance must be checked by the caller, not inferred from values:
    MonthlyHistory shares codes with YearlyHistory and is not an annual input.
    GDAL-invalid pixels become class 0. Misaligned grids fail, never resample.
    """
    if product not in {"YearlyHistory", "YearlyClassification"}:
        raise ValueError("Only documented decoded yearly products are annual inputs")
    if type(block_size) is not int or not 1 <= block_size <= 1024:
        raise ValueError("Expected block_size from 1 to 1024")
    if zone.is_empty or not zone.is_valid or zone.geom_type not in {"Polygon", "MultiPolygon"}:
        raise ValueError("Expected a nonempty valid EPSG:6933 polygon analysis zone")
    totals = np.zeros(16 if after is not None else 4, dtype=np.float64)
    with ExitStack() as stack:
        sources = [stack.enter_context(rasterio.open(before))]
        if after is not None:
            sources.append(stack.enter_context(rasterio.open(after)))
        first = sources[0]
        for source in sources:
            if source.crs != rasterio.crs.CRS.from_epsg(4326) or source.count != 1:
                raise ValueError("Expected a single-band EPSG:4326 yearly raster")
            if (source.shape != first.shape or source.transform != first.transform):
                raise ValueError("Yearly rasters must have identical native grids")
        x0, y0 = GEOGRAPHIC_TO_AREA.transform(first.bounds.left, first.bounds.bottom, errcheck=True)
        x1, y1 = GEOGRAPHIC_TO_AREA.transform(first.bounds.right, first.bounds.top, errcheck=True)
        if not box(x0, y0, x1, y1).covers(zone):
            raise ValueError("Raster extent does not cover the entire analysis zone")
        for row in range(0, first.height, block_size):
            for col in range(0, first.width, block_size):
                window = Window(col, row, min(block_size, first.width - col),
                                min(block_size, first.height - row))
                weights = geographic_intersection_areas(
                    first.transform, (int(window.height), int(window.width)), zone,
                    row_off=row, col_off=col)
                if not weights.any():
                    continue
                classes = []
                for source in sources:
                    data = source.read(1, window=window, masked=True).filled(0)
                    if not np.isin(data, [0, 1, 2, 3]).all():
                        raise ValueError("Expected decoded yearly classes 0, 1, 2, 3")
                    classes.append(data.astype(np.int64))
                indices = classes[0] if after is None else classes[0] * 4 + classes[1]
                totals += np.bincount(indices.ravel(), weights=weights.ravel(), minlength=len(totals))
    tolerance = max(1e-5, zone.area * 1e-10)
    if abs(float(totals.sum()) - zone.area) > tolerance:
        raise ValueError("Raster extent does not cover the entire analysis zone")
    # The small class-area histogram is sufficient for all additive accounting;
    # it retains the full joint classification, including asymmetric missingness.
    if after is None:
        return annual_areas(np.arange(4), totals)
    return compare_areas(np.repeat(np.arange(4), 4), np.tile(np.arange(4), 4), totals)


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
    # Projected edge subtraction and block summation can straddle an exact gate
    # by floating-point roundoff; allow only relative area accounting error.
    tolerance = zone_area * 1e-12
    status = ("complete" if valid_area + tolerance >= zone_area * COMPLETE_COVERAGE else
              "partial" if valid_area + tolerance >= zone_area * PARTIAL_COVERAGE else "suppressed")
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
