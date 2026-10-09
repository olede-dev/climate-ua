# Клімат України — минуле і майбутнє

Інтерактивна карта змін клімату та водних ресурсів України: спостереження з 1950 року і проєкції до кінця XXI століття за даними кліматичних і гідрологічних моделей.

**Демо:** https://olede-dev.github.io/climate-ua/

![Карта дефіциту води по суббасейнах України](.github/screenshot.png)

## Можливості

- Шість тематичних шарів на рівні областей, суббасейнів і річкових станцій.
- Єдина шкала часу для історичного періоду та проєкцій.
- Картка регіону: порівняння «минуле — сучасність — проєкція», графік за весь період, тип клімату за Кеппеном–Гейгером зараз і в майбутньому.
- Стан інтерфейсу (шар, період, регіон) зберігається в URL.

## Шари даних

| Шар | Просторова одиниця | Спостереження | Проєкції |
|---|---|---|---|
| Водний дефіцит і попит, км³ | 265 суббасейнів | 1980–2019 | Дефіцит: 2021–2035, 2036–2050 (SSP1-2.6, SSP3-7.0, SSP5-8.5) |
| Аномалія температури відносно 1991–2020 | 25 областей | 1950–2025 | 2021–2040, 2041–2060, 2081–2100 (SSP2-4.5) |
| Дні з максимумом понад 35 °C | 25 областей | 1950–2025 | 2021–2040, 2041–2060, 2081–2100 (SSP2-4.5) |
| Дні з мінімумом нижче 0 °C | 25 областей | 1950–2025 | 2021–2040, 2041–2060, 2081–2100 (SSP2-4.5) |
| Посуха: місяці зі SPEI-6 нижче −1 | 25 областей | 1950–2025 | 2021–2040, 2041–2060, 2081–2100 (SSP2-4.5) |
| Маловоддя річок відносно норми 1997–2020 | 10 гідростанцій | 1997–2025 | — |

## Методика

Проєкції побудовано методом дельт: до спостережуваної кліматології додається зміна, отримана з ансамблю моделей CMIP6. Кліматичні показники усереднено за 20-річні періоди, водні — за 15-річні. За замовчуванням показано медіану ансамблю (для водних шарів — середнє); також доступні нижня та верхня межі діапазону моделей.

Повний опис методики наведено у [SPEC.md](SPEC.md) та у розділі «Про дані та методику» на сайті.

## Технології

- **Frontend:** Vue 3, TypeScript, Vite, Pinia, TanStack Query, MapLibre GL, Chart.js, Tailwind CSS v4.
- **Тестування:** Vitest.
- **Обробка даних:** Python (xarray, geopandas, rasterio), керування середовищем через [uv](https://docs.astral.sh/uv/).
- **Розгортання:** GitHub Pages через GitHub Actions при пуші в `main`.

## Локальний запуск

```bash
npm install
npm run dev
```

Перевірки, які виконує CI:

```bash
npm run lint && npm test -- --run && npm run build
```

## Конвеєр даних

Застосунок статичний: усі дані містяться в `public/data/` і зберігаються в репозиторії. Їх генерує конвеєр у `pipeline/`, який запускається вручну під час щорічного оновлення.

Передумови: обліковий запис [Copernicus CDS](https://cds.climate.copernicus.eu/), API-ключ у `~/.cdsapirc` і прийнята ліцензія датасету [C3S Atlas](https://cds.climate.copernicus.eu/datasets/multi-origin-c3s-atlas).

```bash
cd pipeline
uv run python build_oblasts.py     # межі областей → public/data/oblasts.geojson
uv run python fetch_atlas.py       # ERA5 і CMIP6 → pipeline/data/raw
uv run python build_climate.py     # → public/data/layers/{temp,heat,frost,drought}.json
uv run python fetch_wwm_basins.py  # басейни та проєкції World Water Map (ArcGIS)
uv run python build_basins.py      # → public/data/basins.geojson
uv run python build_water_use.py   # → public/data/water-use.json
uv run python fetch_koppen.py      # карти Кеппена–Гейгера (~130 МБ)
uv run python build_koppen.py      # → public/data/koppen.json
uv run python fetch_rivers.py      # GloFAS v4 через Open-Meteo
uv run python build_rivers.py      # → public/data/rivers.json
```

Сирі завантаження зберігаються в `pipeline/data/raw/` і не входять до репозиторію.

## Джерела даних

- **Водні ресурси:** модель PCR-GLOBWB 2, Утрехтський університет (Sutanudjaja et al., 2018), у реалізації [World Water Map](https://worldwatermap.nationalgeographic.org/) (National Geographic Society); суббасейни HydroBASINS рівня 7. Дані: [doi:10.24416/UU01-0Q6SU6](https://doi.org/10.24416/UU01-0Q6SU6), CC BY 4.0.
- **Клімат:** [Copernicus Interactive Climate Atlas](https://atlas.climate.copernicus.eu/) (C3S / ECMWF; ERA5, CMIP6), CC BY 4.0.
- **Класифікація Кеппена–Гейгера:** [Beck et al. (2023)](https://doi.org/10.1038/s41597-023-02549-6), *Scientific Data* 10, 724, CC BY 4.0.
- **Річковий стік:** реаналіз GloFAS v4 (Copernicus Emergency Management Service) через [Open-Meteo Flood API](https://open-meteo.com/en/docs/flood-api).
- **Адміністративні межі:** [geoBoundaries](https://www.geoboundaries.org/) (© OpenStreetMap, ODbL); суходіл — [Natural Earth](https://www.naturalearthdata.com/).
- **Базова карта:** [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles, © OpenStreetMap.
