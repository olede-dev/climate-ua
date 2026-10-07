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

#: World Water Map downloads (Utrecht University, CC BY 4.0).
WWM_DIR = RAW_DIR / "wwm"
WATER_USE_PATH = PUBLIC_DATA / "water-use.json"
#: The World Water Map's own basin service (HydroBASINS level 7, ArcGIS, open, no key): the
#: figures the site shows, per basin, as `|`-joined yearly series. Its water gap is demand minus
#: withdrawal, unlike the package's `WaterGap` files (non-renewable abstraction only), and it
#: alone has the projection.
WWM_BASINS_URL = (
    "https://services3.arcgis.com/AdYB7LvDmN7hzWUb/arcgis/rest/services/hydrobasins_lvl7_publish/FeatureServer/0/query"
)
WWM_BASINS_PATH = WWM_DIR / "hydrobasins_lvl7.geojson"
#: Service sector suffix per site sector, for `demand_historical_*` and `gap_historical_*`.
WWM_SECTOR_FIELDS = {"total": "total", "irrigation": "irrigation", "domestic": "domestic", "industrial": "industrial"}
#: Projection of the total water gap, yearly from WWM_FUTURE[0]: mean, min and max of the models.
WWM_FUTURE = (2020, 2050)
WWM_SCENARIOS = {"SSP1-2.6": "A_126", "SSP3-7.0": "A_370", "SSP5-8.5": "A_585"}

WATER_HISTORY = (1980, 2019)
#: SPEC §5.1: the last 30 years of the Utrecht record.
WATER_NORM = (1990, 2019)
#: SPEC §4.6: a basin with less of Ukraine than this joins its neighbour.
BASIN_MIN_KM2 = 200
#: ≈800 m; keeps the 265 subbasins under 700 KB.
BASINS_SIMPLIFY_DEG = 0.008
BASINS_PATH = PUBLIC_DATA / "basins.geojson"
#: An oblast is listed for a basin when it holds at least this share of the basin's area in Ukraine.
BASIN_OBLAST_MIN_SHARE = 0.05

#: Natural Earth rivers for basin names (SPEC §13.6).
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
    "Mukhavyets": ("Мухавець", "Mukhavets"),
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

WWM_SOURCE = "Utrecht University, World Water Map (PCR-GLOBWB 2)"

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

@dataclass(frozen=True)
class RiverStation:
    id: str
    river: str
    place: str
    river_en: str
    place_en: str
    #: GloFAS cell (lat, lon) whose mean discharge matches the gauged river, not the town centre.
    cell: tuple[float, float]
    #: Where the map draws the station: on the OpenStreetMap river line next to the cell.
    marker: tuple[float, float]


RIVER_STATIONS = [
    RiverStation("dnipro-kyiv", "Дніпро", "Київ", "Dnipro", "Kyiv", cell=(50.4, 30.52), marker=(50.3877, 30.5868)),
    RiverStation("desna-chernihiv", "Десна", "Чернігів", "Desna", "Chernihiv", cell=(51.47, 31.26), marker=(51.4512, 31.2818)),
    RiverStation("desna-novhorod-siverskyi", "Десна", "Новгород-Сіверський", "Desna", "Novhorod-Siverskyi", cell=(51.95, 33.27), marker=(51.9418, 33.276)),
    RiverStation("prypiat-chornobyl", "Прип’ять", "Чорнобиль", "Prypiat", "Chornobyl", cell=(51.23, 30.28), marker=(51.2495, 30.2906)),
    RiverStation("dnister-zalishchyky", "Дністер", "Заліщики", "Dniester", "Zalishchyky", cell=(48.64, 25.78), marker=(48.6406, 25.7469)),
    RiverStation("prut-chernivtsi", "Прут", "Чернівці", "Prut", "Chernivtsi", cell=(48.26, 25.98), marker=(48.276, 26.0118)),
    RiverStation("tysa-vylok", "Тиса", "Вилок", "Tisza", "Vylok", cell=(48.1, 22.78), marker=(48.1095, 22.7734)),
    RiverStation("danube-izmail", "Дунай", "Ізмаїл", "Danube", "Izmail", cell=(45.34, 28.89), marker=(45.3159, 28.8726)),
    RiverStation("pivdennyi-buh-pervomaisk", "Південний Буг", "Первомайськ", "Southern Bug", "Pervomaisk", cell=(48.04, 30.85), marker=(48.0438, 30.8414)),
    RiverStation("siverskyi-donets-izium", "Сіверський Донець", "Ізюм", "Siverskyi Donets", "Izium", cell=(49.16, 37.26), marker=(49.1595, 37.2641)),
]

#: Open-Meteo Flood API: GloFAS v4 reanalysis, daily discharge from 1997 (earlier days are null).
FLOOD_API_URL = "https://flood-api.open-meteo.com/v1/flood"
RIVERS_YEARS = (1997, 2025)
#: Day-of-year norm: 1997–2020, the WMO normal 1991–2020 shortened to the reanalysis start.
RIVERS_NORM = (1997, 2020)
#: Values from d−3…d+3 feed the norm for day d.
RIVERS_NORM_HALF_WINDOW = 3
RIVERS_DIR = RAW_DIR / "rivers"
RIVERS_SOURCE = "GloFAS v4 reanalysis via Open-Meteo"
RIVERS_PATH = PUBLIC_DATA / "rivers.json"
