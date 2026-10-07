# Клімат України — минуле і майбутнє

Інтерактивна карта: як змінювались клімат і водні ресурси України і що очікується до кінця століття. Одна карта, один повзунок часу, один регіон у фокусі: «днів сильної спеки було 2 на рік, стане 9».

**Сайт:** https://olede-dev.github.io/climate-ua/

## Що на карті

| Шар | Регіони | Минуле | Майбутнє |
|---|---|---|---|
| Вода — водний стрес, % забору від доступної води | 89 суббасейнів | 1980–2019 | 2030, 2050, 2080 (SSP3-7.0) |
| Температура — відхилення від норми 1991–2020 | 25 областей | 1950–2025 | 2021–2040, 2041–2060, 2081–2100 (SSP2-4.5) |
| Сильна спека — дні понад 35 °C | 25 областей | 1950–2025 | те саме |
| Морози — дні з мінімумом нижче 0 °C | 25 областей | 1950–2025 | те саме |
| Посуха — місяці зі SPEI-6 нижче −1 | 25 областей | 1950–2025 | те саме |
| Річки — дні маловоддя | 10 річкових станцій | 1997–2025 | прогнозу немає |

Клік по регіону відкриває картку: речення «було → стало → буде», графік від початку спостережень до кінця століття, для областей — тип клімату за Кеппеном зараз і в майбутньому. Стан (шар, час, регіон) зберігається в URL, тож посиланням можна поділитися.

Майбутнє — середнє за 20–30 років за методом дельт: до норми за спостереженнями додається зміна, яку дає кожна кліматична модель, і береться медіана моделей. Докладно — у вікні «Про дані та методику» на сайті і в [SPEC.md](SPEC.md).

## Запуск

```bash
npm install
npm run dev
```

Перевірки (той самий порядок, що в CI):

```bash
npm run lint && npm test -- --run && npm run build
```

## Дані

Сайт статичний: усе, що він показує, лежить у `public/data/` і закомічене. Ці файли будує конвеєр на Python у `pipeline/` (керується [uv](https://docs.astral.sh/uv/)). Його запускають вручну раз на рік, а не в CI.

Перед першим запуском:

1. Акаунт [Copernicus CDS](https://cds.climate.copernicus.eu/): ключ у `~/.cdsapirc` і прийнята ліцензія датасету [C3S Atlas](https://cds.climate.copernicus.eu/datasets/multi-origin-c3s-atlas).
2. Пакет [World Water Map](https://doi.org/10.24416/UU01-0Q6SU6) Утрехтського університету — вручну через браузер (репозиторій закритий перевіркою на ботів). Потрібні 8 файлів `demand/gridded_annual/*GrossDemand_annuaTot_output.nc` і `gap/gridded_annual/*WaterGap_annuaTot_output.nc` (~760 МБ) у `pipeline/data/raw/wwm/` зі збереженням структури папок.

```bash
cd pipeline
uv run python build_oblasts.py   # межі областей → public/data/oblasts.geojson
uv run python fetch_atlas.py     # ERA5 і CMIP6 → pipeline/data/raw (кілька хвилин)
uv run python build_climate.py   # → public/data/layers/{temp,heat,frost,drought}.json
uv run python fetch_aqueduct.py  # WRI Aqueduct 4.0, ~260 МБ
uv run python build_basins.py    # суббасейни → public/data/basins.geojson
uv run python build_water.py     # Утрехт + Aqueduct → public/data/layers/water.json
uv run python build_water_use.py # попит і дефіцит по галузях → public/data/water-use.json
uv run python fetch_koppen.py    # карти Кеппена–Гейгера, ~130 МБ
uv run python build_koppen.py    # → public/data/koppen.json
uv run python fetch_rivers.py    # GloFAS v4 через Open-Meteo (з паузами на ліміт запитів)
uv run python build_rivers.py    # → public/data/rivers.json
```

Сирі завантаження лежать у `pipeline/data/raw/` і в git не потрапляють.

## Джерела

- Вода, минуле — [World Water Map Data Package](https://doi.org/10.24416/UU01-0Q6SU6), Утрехтський університет (модель PCR-GLOBWB 2, Sutanudjaja et al. 2018), CC BY 4.0.
- Вода, майбутнє, і межі суббасейнів — [WRI Aqueduct 4.0](https://www.wri.org/aqueduct), World Resources Institute.
- Клімат — [Copernicus Interactive Climate Atlas](https://atlas.climate.copernicus.eu/) (C3S / ECMWF: ERA5, CMIP6), CC BY 4.0.
- Тип клімату — [Beck et al. (2023)](https://doi.org/10.1038/s41597-023-02549-6), *Scientific Data* 10, 724, CC BY 4.0.
- Річки — реаналіз GloFAS v4 (Copernicus Emergency Management Service) через [Open-Meteo Flood API](https://open-meteo.com/en/docs/flood-api).
- Межі областей — [geoBoundaries](https://www.geoboundaries.org/) (© OpenStreetMap, ODbL), суходіл — [Natural Earth](https://www.naturalearthdata.com/).
- Підкладка — [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles, © OpenStreetMap.

## Стек

Vue 3 + TypeScript, Vite, Pinia, TanStack Query, MapLibre GL, Chart.js, Tailwind CSS v4, Vitest. Конвеєр — Python: xarray, geopandas, rasterio. Деплой на GitHub Pages при пуші в `main`.
