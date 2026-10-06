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

## Стек

Vue 3 + TypeScript, Vite, Pinia, TanStack Query, MapLibre GL, Chart.js, Tailwind CSS v4, Vitest. Деплой на GitHub Pages при пуші в `main`.
