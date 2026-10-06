"""Shared settings of the data pipeline: periods, sources, layers and paths (SPEC §4–5)."""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

PIPELINE_DIR = Path(__file__).parent
RAW_DIR = PIPELINE_DIR / "data" / "raw"
PUBLIC_DATA = PIPELINE_DIR.parent / "public" / "data"

# --- Periods -------------------------------------------------------------------------------

#: WMO climate normal; the reference for every climate layer and for the model deltas.
NORM = (1991, 2020)
#: First year shown for the climate layers; ERA5 starts in 1940 but has fewer observations
#: before the 1950s.
HISTORY_FROM = 1950
#: IPCC AR6 periods: near, mid and long term.
FUTURE_PERIODS = {"2021-2040": (2021, 2040), "2041-2060": (2041, 2060), "2081-2100": (2081, 2100)}

# --- Geometry ------------------------------------------------------------------------------

#: Atlas request box [N, W, S, E]; ERA5 (0.25°) and CMIP6 (1°) cells inside it cover all of
#: Ukraine (22.1–40.2°E, 44.4–52.4°N).
AREA = [53, 22, 44, 41]
#: Equal-area projection for cell–region overlap areas.
EQUAL_AREA_CRS = "EPSG:6933"

#: geoBoundaries gbOpen UKR ADM1, pinned release (ODbL 1.0, from OpenStreetMap).
GEOBOUNDARIES_URL = (
    "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/UKR/ADM1/"
    "geoBoundaries-UKR-ADM1.geojson"
)
#: Natural Earth, Ukrainian point of view (includes Crimea); clips the sea out of coastal
#: regions, whose OSM boundaries run into territorial waters. Public domain.
NATURAL_EARTH_UKR_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/"
    "ne_10m_admin_0_countries_ukr.geojson"
)


@dataclass(frozen=True)
class Region:
    id: str
    uk: str
    en: str


#: ISO 3166-2 code → region. Kyiv city joins Kyiv Oblast and Sevastopol joins Crimea
#: (SPEC §4.6): at 1° model resolution a city has no climate of its own.
REGIONS: dict[str, Region] = {
    "UA-05": Region("vinnytsia", "Вінницька область", "Vinnytsia Oblast"),
    "UA-07": Region("volyn", "Волинська область", "Volyn Oblast"),
    "UA-09": Region("luhansk", "Луганська область", "Luhansk Oblast"),
    "UA-12": Region("dnipropetrovsk", "Дніпропетровська область", "Dnipropetrovsk Oblast"),
    "UA-14": Region("donetsk", "Донецька область", "Donetsk Oblast"),
    "UA-18": Region("zhytomyr", "Житомирська область", "Zhytomyr Oblast"),
    "UA-21": Region("zakarpattia", "Закарпатська область", "Zakarpattia Oblast"),
    "UA-23": Region("zaporizhzhia", "Запорізька область", "Zaporizhzhia Oblast"),
    "UA-26": Region("ivano-frankivsk", "Івано-Франківська область", "Ivano-Frankivsk Oblast"),
    "UA-30": Region("kyiv", "Київська область", "Kyiv Oblast"),
    "UA-32": Region("kyiv", "Київська область", "Kyiv Oblast"),
    "UA-35": Region("kirovohrad", "Кіровоградська область", "Kirovohrad Oblast"),
    "UA-40": Region("crimea", "Автономна Республіка Крим", "Autonomous Republic of Crimea"),
    "UA-43": Region("crimea", "Автономна Республіка Крим", "Autonomous Republic of Crimea"),
    "UA-46": Region("lviv", "Львівська область", "Lviv Oblast"),
    "UA-48": Region("mykolaiv", "Миколаївська область", "Mykolaiv Oblast"),
    "UA-51": Region("odesa", "Одеська область", "Odesa Oblast"),
    "UA-53": Region("poltava", "Полтавська область", "Poltava Oblast"),
    "UA-56": Region("rivne", "Рівненська область", "Rivne Oblast"),
    "UA-59": Region("sumy", "Сумська область", "Sumy Oblast"),
    "UA-61": Region("ternopil", "Тернопільська область", "Ternopil Oblast"),
    "UA-63": Region("kharkiv", "Харківська область", "Kharkiv Oblast"),
    "UA-65": Region("kherson", "Херсонська область", "Kherson Oblast"),
    "UA-68": Region("khmelnytskyi", "Хмельницька область", "Khmelnytskyi Oblast"),
    "UA-71": Region("cherkasy", "Черкаська область", "Cherkasy Oblast"),
    "UA-74": Region("chernihiv", "Чернігівська область", "Chernihiv Oblast"),
    "UA-77": Region("chernivtsi", "Чернівецька область", "Chernivtsi Oblast"),
}
OBLASTS_PATH = PUBLIC_DATA / "oblasts.geojson"
#: ≈500 m: invisible at country zoom, keeps the file under 300 KB (SPEC §4.6).
OBLASTS_SIMPLIFY_DEG = 0.005

# --- Climate layers (C3S Atlas, CDS dataset multi-origin-c3s-atlas) ------------------------

ATLAS_DATASET = "multi-origin-c3s-atlas"
ERA5_PERIOD = "1940-2025"
CMIP6_RUNS = {"historical": "1850-2014", "ssp2_4_5": "2015-2100"}
#: Shown next to the timeline; the CMIP6 experiment above.
CLIMATE_SCENARIO = "SSP2-4.5"


@dataclass(frozen=True)
class ClimateLayer:
    id: str
    #: Atlas request variable.
    variable: str
    #: Variable name inside the NetCDF files.
    nc_name: str
    unit: str
    #: How twelve monthly values make a year: day-weighted mean or sum.
    annual: Literal["mean", "sum"]
    #: Lower and upper bound of a valid annual value; deltas are clipped to it (SPEC §5.2).
    bounds: tuple[float | None, float | None]
    decimals: int


CLIMATE_LAYERS = {
    "temp": ClimateLayer(
        id="temp",
        variable="monthly_temperature",
        nc_name="t",
        unit="°C",
        annual="mean",
        bounds=(None, None),
        decimals=2,
    ),
}

ATLAS_SOURCE = "Copernicus Interactive Climate Atlas (C3S): ERA5, CMIP6"
