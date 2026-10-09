"""Downloads the C3S Atlas files every climate layer needs into data/raw/atlas.

Needs a CDS account: the API key in ~/.cdsapirc and the dataset licence accepted on its page.
Files already on disk are kept; delete one to download it again.
"""

import zipfile
from pathlib import Path

import cdsapi

import config

ATLAS_DIR = config.RAW_DIR / "atlas"


def atlas_file(origin: str, experiment: str, layer: config.ClimateLayer) -> Path:
    return ATLAS_DIR / f"{layer.id}_{origin}_{experiment}.nc"


def requests(layer: config.ClimateLayer):
    common = {"domain": "global", "variable": layer.variable, "area": config.AREA}
    yield atlas_file("era5", "observed", layer), {**common, "origin": "era5", "period": config.ERA5_PERIOD}
    for experiment, period in config.CMIP6_RUNS.items():
        request = {
            **common,
            "origin": "cmip6",
            "experiment": experiment,
            "period": period,
            # Raw model output: the deltas take the place of bias adjustment.
            "bias_adjustment": "no_bias_adjustment",
        }
        yield atlas_file("cmip6", experiment, layer), request


def fetch(client: cdsapi.Client, target: Path, request: dict) -> None:
    archive = target.with_suffix(".zip")
    client.retrieve(config.ATLAS_DATASET, request, str(archive))
    with zipfile.ZipFile(archive) as zf:
        [name] = [n for n in zf.namelist() if n.endswith(".nc")]
        target.write_bytes(zf.read(name))
    archive.unlink()


def main() -> None:
    ATLAS_DIR.mkdir(parents=True, exist_ok=True)
    client = cdsapi.Client(quiet=True)
    for layer in config.CLIMATE_LAYERS.values():
        for target, request in requests(layer):
            if target.exists():
                print(f"Keeping {target.name}")
                continue
            print(f"Requesting {target.name} (the CDS queue can take minutes)")
            fetch(client, target, request)


if __name__ == "__main__":
    main()
