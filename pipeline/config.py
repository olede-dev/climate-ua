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
    #: How twelve monthly values make a year: day-weighted mean, sum or count of months with
    #: SPEI below DRY_SPEI.
    annual: Literal["mean", "sum", "dry_months"]
    #: Lower and upper bound of a valid annual value; deltas are clipped to it (SPEC §5.2).
    bounds: tuple[float | None, float | None]
    decimals: int
    #: How a model's change joins the observed norm: added as it is, or scaled by how the
    #: observed norm compares with the model's own (`scaled_delta`, SPEC §5.2).
    delta: Literal["add", "scale"] = "add"


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
    "heat": ClimateLayer(
        id="heat",
        variable="monthly_extreme_hot_days",
        nc_name="tx35",
        unit="днів",
        annual="sum",
        bounds=(0, 365),
        decimals=1,
        delta="scale",
    ),
    "frost": ClimateLayer(
        id="frost",
        variable="monthly_frost_days",
        nc_name="fd",
        unit="днів",
        annual="sum",
        bounds=(0, 365),
        decimals=1,
        delta="scale",
    ),
    "drought": ClimateLayer(
        id="drought",
        variable="monthly_standardised_precipitation_evapotranspiration_index_for_6_months_cumulation_period",
        nc_name="spei6",
        unit="місяців",
        annual="dry_months",
        bounds=(0, 12),
        decimals=1,
    ),
}

#: Days added to both norms before scaling a delta: where a model or the observations have
#: almost no such days, the ratio is unstable, and the change falls back to being added.
SCALE_PSEUDO_DAYS = 1.0

#: SPEI-6 below this marks a dry month (moderate drought and worse, SPEC §4.3).
DRY_SPEI = -1.0

ATLAS_SOURCE = "Copernicus Interactive Climate Atlas (C3S): ERA5, CMIP6"

# --- Water layer (SPEC §4.1, §4.2, §5.3) ---------------------------------------------------

#: World Water Map Data Package (Utrecht University, CC BY 4.0), downloaded by hand through a
#: browser (the repository sits behind a bot check) into this folder, keeping its layout.
WWM_DIR = RAW_DIR / "wwm"
#: Annual totals, 1980–2019, global 5 arcmin grid. Each value is a depth of water over the
#: cell (the files say `m.month-1`, a leftover of the monthly source: the annual files hold the
#: sum of twelve months). The package has no water availability, only demand and the water gap.
WWM_DEMAND = {
    sector: (WWM_DIR / "demand" / "gridded_annual" / f"{sector}GrossDemand_annuaTot_output.nc", f"{sector}_gross_demand")
    for sector in ("total", "domestic", "industry", "irrigation")
}

#: WRI Aqueduct 4.0, free to use with attribution.
AQUEDUCT_URL = "https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip"
AQUEDUCT_DIR = RAW_DIR / "aqueduct" / "Aqueduct40_waterrisk_download_Y2023M07D05"
#: Basin polygons (HydroBASINS level 6) with the future indicators.
AQUEDUCT_GDB = AQUEDUCT_DIR / "GDB" / "Aq40_Y2023D07M05.gdb"
AQUEDUCT_GDB_LAYER = "future_annual"
#: Baseline 1979–2019: one row per basin and admin-1 unit. `bws_raw` is the water stress ratio
#: (withdrawal / available water, upstream inflow included); `bws_cat` −1 marks basins that are
#: «arid and low water use», where the ratio is unstable (SPEC §13.8).
AQUEDUCT_BASELINE_CSV = AQUEDUCT_DIR / "CVS" / "Aqueduct40_baseline_annual_y2023m07d05.csv"
#: Future: median of five CMIP6 models; `bau` is SSP3-7.0, `_ws_x_r` the raw stress ratio
#: (not the 0–5 score `_s`). Periods are 30 years around the year named.
AQUEDUCT_FUTURE_FIELDS = {"2030": "bau30_ws_x_r", "2050": "bau50_ws_x_r", "2080": "bau80_ws_x_r"}
AQUEDUCT_ARID_CAT = -1

WATER_SCENARIO = "SSP3-7.0"
WATER_HISTORY = (1980, 2019)
#: SPEC §5.1: the last 30 years of the Utrecht record.
WATER_NORM = (1990, 2019)
#: SPEC §4.6: a basin with less of Ukraine than this joins its neighbour.
BASIN_MIN_KM2 = 200
#: ≈800 m; keeps basins.geojson under 500 KB (SPEC §4.6).
BASINS_SIMPLIFY_DEG = 0.008
BASINS_PATH = PUBLIC_DATA / "basins.geojson"
#: An oblast is listed for a basin when it holds at least this share of the basin's area in Ukraine.
BASIN_OBLAST_MIN_SHARE = 0.05

#: Natural Earth rivers for basin names (SPEC §13.6), the same sources rivers-ua draws.
NATURAL_EARTH_RIVERS_URLS = [
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_rivers_lake_centerlines.geojson",
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_rivers_europe.geojson",
]

#: Natural Earth lakes, for the Kakhovka Reservoir (destroyed in June 2023, SPEC §13.7): basins
#: it touched get a note that the data predate its loss.
NATURAL_EARTH_LAKES_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_lakes.geojson"
)
KAKHOVKA_NAME = "Kakhovka Reservoir"

#: A basin is named after the river with the longest course through it, if at least this long.
BASIN_RIVER_MIN_KM = 10
#: Natural Earth name → (Ukrainian, English) for every river that names a basin. Natural Earth
#: has no Ukrainian name for some of them and Russian or Romanian spellings for others.
RIVER_NAMES = {
    "Bratul Chillia": ("Дунай", "Danube"),
    "Bug": ("Західний Буг", "Western Bug"),
    "Danube": ("Дунай", "Danube"),
    "Desna": ("Десна", "Desna"),
    "Dnipro": ("Дніпро", "Dnipro"),
    "Dniester": ("Дністер", "Dniester"),
    "Donets": ("Сіверський Донець", "Siverskyi Donets"),
    "Haryn": ("Горинь", "Horyn"),
    "Latorytsya": ("Латориця", "Latorytsia"),
    "Oskol": ("Оскіл", "Oskil"),
    "Pripyat": ("Прип’ять", "Prypiat"),
    "Prut": ("Прут", "Prut"),
    "Prypyat": ("Прип’ять", "Prypiat"),
    "Ros": ("Рось", "Ros"),
    "San": ("Сян", "San"),
    "Seym": ("Сейм", "Seim"),
    "Siret": ("Серет", "Siret"),
    "Sluch": ("Случ", "Sluch"),
    "Snov": ("Снов", "Snov"),
    "Southern Bug": ("Південний Буг", "Southern Buh"),
    "Sozh": ("Сож", "Sozh"),
    "Styr": ("Стир", "Styr"),
    "Synyukha": ("Синюха", "Syniukha"),
    "Teteriv": ("Тетерів", "Teteriv"),
    "Ubort": ("Уборть", "Ubort"),
    "Uzh": ("Уж", "Uzh"),
}

WATER_SOURCE = "Utrecht University, World Water Map (PCR-GLOBWB 2); WRI Aqueduct 4.0"

# --- Climate analogue (SPEC §4.4) ----------------------------------------------------------

#: Beck et al. (2023), Köppen–Geiger maps at 1 km, 1901–2099 (figshare article 21789074, v2).
KOPPEN_URL = "https://ndownloader.figshare.com/files/61012822"
KOPPEN_DIR = RAW_DIR / "koppen"
#: Period → GeoTIFF inside the archive; the future follows SSP2-4.5 like the climate layers.
KOPPEN_FILES = {
    "1991-2020": "1991_2020/koppen_geiger_0p00833333.tif",
    "2041-2070": "2041_2070/ssp245/koppen_geiger_0p00833333.tif",
    "2071-2099": "2071_2099/ssp245/koppen_geiger_0p00833333.tif",
}
#: Raster code → class, as in the archive's legend.txt (0 is the sea).
KOPPEN_CLASSES = [
    "Af", "Am", "Aw", "BWh", "BWk", "BSh", "BSk", "Csa", "Csb", "Csc", "Cwa", "Cwb", "Cwc",
    "Cfa", "Cfb", "Cfc", "Dsa", "Dsb", "Dsc", "Dsd", "Dwa", "Dwb", "Dwc", "Dwd", "Dfa", "Dfb",
    "Dfc", "Dfd", "ET", "EF",
]
KOPPEN_PATH = PUBLIC_DATA / "koppen.json"

# --- Rivers (SPEC §4.5) --------------------------------------------------------------------

RIVERS_UA = PIPELINE_DIR.parent.parent / "rivers-ua"
RIVERS_CLIMATE = RIVERS_UA / "public" / "data" / "climate.json"
RIVERS_STATIONS = RIVERS_UA / "src" / "config" / "stations.generated.json"
RIVERS_SEEDS = RIVERS_UA / "src" / "config" / "station-seeds.ts"
RIVERS_PATH = PUBLIC_DATA / "rivers.json"
