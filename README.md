# Клімат України — минуле і майбутнє

Інтерактивна карта: як змінювались клімат і водні ресурси України з 1950 року і що очікується до кінця століття. Вода, спека, морози й посуха по регіонах; історія по роках і прогнози за періодами.

**Сайт:** https://olede-dev.github.io/climate-ua/

Статус: у розробці. Технічне завдання — [SPEC.md](SPEC.md). Сусідній проєкт: [rivers-ua](https://github.com/olede-dev/rivers-ua).

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

Сайт статичний: усе, що він показує, лежить у `public/data/` і закомічене. Ці файли будує конвеєр на Python у `pipeline/` (керується [uv](https://docs.astral.sh/uv/)). Його запускають вручну, а не в CI.

Перед першим запуском потрібен акаунт [Copernicus CDS](https://cds.climate.copernicus.eu/): ключ у `~/.cdsapirc` і прийнята ліцензія датасету [C3S Atlas](https://cds.climate.copernicus.eu/datasets/multi-origin-c3s-atlas).

```bash
cd pipeline
uv run python build_oblasts.py   # межі областей → public/data/oblasts.geojson
uv run python fetch_atlas.py     # ERA5 і CMIP6 → pipeline/data/raw (кілька хвилин)
uv run python build_climate.py   # шари клімату → public/data/layers/*.json
```

Джерела: Copernicus Interactive Climate Atlas (C3S, CC BY 4.0); межі — geoBoundaries (© OpenStreetMap, ODbL) і Natural Earth.

## Стек

Vue 3 + TypeScript, Vite, Pinia, TanStack Query, MapLibre GL, Chart.js, Tailwind CSS v4, Vitest. Деплой на GitHub Pages при пуші в `main`.
