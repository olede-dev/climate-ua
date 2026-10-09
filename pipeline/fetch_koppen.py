"""Downloads Beck et al. (2023) Köppen–Geiger maps into data/raw/koppen, ~130 MB.

Unpacks only the three 1 km GeoTIFFs of `config.KOPPEN_FILES` and the legend.
"""

import zipfile

import config
from common import download


def main() -> None:
    targets = [config.KOPPEN_DIR / name for name in config.KOPPEN_FILES.values()]
    if all(path.exists() for path in targets):
        print(f"Keeping {config.KOPPEN_DIR}")
        return
    archive = download(config.KOPPEN_URL, config.KOPPEN_DIR / "koppen_geiger_tif.zip")
    wanted = {*config.KOPPEN_FILES.values(), "legend.txt"}
    with zipfile.ZipFile(archive) as zf:
        members = [m for m in zf.namelist() if m in wanted]
        missing = wanted - set(members)
        if missing:
            raise ValueError(f"Archive lacks {sorted(missing)}; it holds e.g. {zf.namelist()[:10]}")
        zf.extractall(config.KOPPEN_DIR, members)
    print(f"Unpacked {len(members)} files into {config.KOPPEN_DIR}")


if __name__ == "__main__":
    main()
