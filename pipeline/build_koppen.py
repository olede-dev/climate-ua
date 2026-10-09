"""Writes public/data/koppen.json: each oblast's dominant Köppen–Geiger class.

For 1991–2020 and two SSP2-4.5 periods; a class dominates when it covers the largest area of
the oblast on the 1 km map, with pixels weighted by their area (cosine of latitude).
"""

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import from_bounds

import config
from common import land_regions, write_json


def dominant_classes(path, regions) -> dict[str, str]:
    with rasterio.open(path) as src:
        window = from_bounds(*regions.total_bounds, transform=src.transform).round_offsets().round_lengths()
        codes = src.read(1, window=window)
        transform = src.window_transform(window)
    rows = np.arange(codes.shape[0])
    lat = transform.f + (rows + 0.5) * transform.e
    area = np.broadcast_to(np.cos(np.radians(lat))[:, None], codes.shape)

    # Every pixel whose centre lies in an oblast takes the oblast's index; 0 is outside them all.
    owner = rasterize(
        ((geom, i + 1) for i, geom in enumerate(regions.geometry)),
        out_shape=codes.shape,
        transform=transform,
        dtype="int16",
    )
    out = {}
    for i, region_id in enumerate(regions["id"]):
        inside = (owner == i + 1) & (codes >= 1) & (codes <= len(config.KOPPEN_CLASSES))
        totals = np.bincount(codes[inside], weights=area[inside], minlength=len(config.KOPPEN_CLASSES) + 1)
        if totals.sum() == 0:
            raise ValueError(f"{region_id}: no land pixels in {path.name}")
        out[region_id] = config.KOPPEN_CLASSES[int(totals.argmax()) - 1]
        shares = sorted(((t / totals.sum(), config.KOPPEN_CLASSES[c - 1]) for c, t in enumerate(totals) if c and t), reverse=True)
        print(f"  {region_id:16} " + ", ".join(f"{name} {share:.0%}" for share, name in shares[:3]))
    return out


def main() -> None:
    regions = land_regions()
    by_period = {}
    for period, name in config.KOPPEN_FILES.items():
        print(period)
        by_period[period] = dominant_classes(config.KOPPEN_DIR / name, regions)
    data = {
        "periods": list(config.KOPPEN_FILES),
        "scenario": config.CLIMATE_SCENARIO,
        "regions": {rid: {p: by_period[p][rid] for p in config.KOPPEN_FILES} for rid in regions["id"]},
        "source": "Beck et al. (2023), Scientific Data 10, 724",
    }
    size = write_json(config.KOPPEN_PATH, data)
    print(f"Wrote {len(data['regions'])} regions ({size} B) to {config.KOPPEN_PATH}")


if __name__ == "__main__":
    main()
