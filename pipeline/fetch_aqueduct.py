"""Downloads and unpacks WRI Aqueduct 4.0 into data/raw/aqueduct (SPEC §4.2), ~260 MB.

The Utrecht package (SPEC §4.1) cannot be fetched by a script: see `config.WWM_DIR`.
"""

import zipfile

import config
from common import download


def main() -> None:
    if config.AQUEDUCT_GDB.exists():
        print(f"Keeping {config.AQUEDUCT_DIR.name}")
        return
    archive = download(config.AQUEDUCT_URL, config.RAW_DIR / "aqueduct" / "aqueduct-4-0-water-risk-data.zip")
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(archive.parent)
    print(f"Unpacked {config.AQUEDUCT_DIR}")


if __name__ == "__main__":
    main()
