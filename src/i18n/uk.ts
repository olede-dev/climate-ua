/** Ukrainian UI copy; the source of truth for the `Messages` shape every locale fills. */
export const uk = {
  /** Value of the `lang` attribute and the BCP 47 tag for `Intl`. */
  htmlLang: 'uk',
  documentTitle: 'Клімат України — минуле і майбутнє',
  documentDescription:
    'Як змінювались клімат і водні ресурси України з 1950 року і що очікується до кінця століття.',

  header: {
    title: 'Клімат України',
    titleSuffix: ' — минуле і майбутнє',
    subtitleShort: 'Минуле і майбутнє',
    subtitleLong: 'Вода, спека, морози й посуха по регіонах',
  },
  theme: {
    label: 'Тема',
    menuLabel: 'Тема оформлення',
    auto: 'Авто',
    light: 'Світла',
    dark: 'Темна',
  },
  language: {
    label: 'Мова',
    menuLabel: 'Мова інтерфейсу',
  },
  footer: {
    map: 'Мапа:',
    about: 'Про дані та методику',
  },
  about: {
    heading: 'Про дані',
    close: 'Закрити',
    statusHeading: 'Стан проєкту',
    status:
      'Проєкт у розробці: на карті вода, температура, спека, морози, посуха й річки, у картці області — тип клімату зараз і в майбутньому. Далі — мобільна версія і розділ «Про дані».',
  },
  home: {
    map: 'Карта',
    loadError: 'Не вдалося завантажити дані карти. Оновіть сторінку.',
    panel: 'Пояснення до карти',
    layers: 'Шар карти',
    hotspots: 'Гарячі точки',
    /** `{value}`: the threshold with its unit. */
    hotspotsHint: 'Показати суббасейни, де люди забирають понад {value} доступної води',
  },
  panel: {
    country: 'Україна',
    pickRegion: 'Натисніть на область, щоб побачити її історію і прогноз.',
    pickBasin: 'Натисніть на суббасейн, щоб побачити його історію і прогноз.',
    pickStation: 'Натисніть на точку на річці, щоб побачити її історію.',
    close: 'Закрити картку регіону',
    loading: 'Завантаження графіка',
  },
  scenarios: {
    'SSP2-4.5': 'Прогноз — за сценарієм SSP2-4.5: світ скорочує викиди повільно.',
    'SSP3-7.0':
      'Прогноз — за сценарієм SSP3-7.0, який WRI називає «business as usual»: усе йде, як досі.',
  },
  story: {
    country: 'в Україні',
    range: ' (від {low} до {high})',
    missingYear: 'За {year} рік даних немає.',
    missingPeriod: 'Прогнозу на {period} немає.',
    noForecast: 'Прогнозу для річок немає.',
    /** `{n}`: how many stations the country figure averages. */
    stations: 'на {n} річкових станціях у середньому',
  },
  chart: {
    now: 'Зараз',
    norm: 'норма',
    /** `{title}`, `{from}`, `{to}`, `{end}`. */
    aria: '{title}: стовпчики по роках {from}–{to}, далі прогноз періодами до {end}.',
    /** A layer without projections: `{title}`, `{from}`, `{to}`. */
    ariaHistory: '{title}: стовпчики по роках {from}–{to}.',
  },
  basin: {
    /** `{river}`. */
    named: 'Басейн річки {river}',
    namedWhere: 'у басейні річки {river}',
    /** `{where}`: «у Луганській області». */
    unnamed: 'Суббасейн {where}',
    unnamedWhere: 'у цьому суббасейні',
    /** `{year}`. */
    sectors: 'На що забирали воду у {year} році',
    irrigation: 'Зрошення',
    domestic: 'Побут',
    industrial: 'Промисловість',
    kakhovka:
      'Каховське водосховище зруйноване в червні 2023 року. Дані (до 2019 року) і прогноз цього не враховують.',
  },
  station: {
    /** `{river}`, `{place}`. */
    name: '{river} — {place}',
    where: 'на річці {river} ({place})',
  },
  koppen: {
    title: 'Тип клімату за Кеппеном',
    /** `{name}`, `{code}`. */
    now: 'Клімат регіону зараз: {name} ({code}).',
    /** `{period}`, `{name}`, `{code}`. */
    future: 'У {period}: {name} ({code}).',
    /** `{period}`. */
    same: 'У {period} тип клімату за Кеппеном не зміниться.',
    /** `{scenario}`. */
    note: 'Тип клімату — за Beck et al. (2023), прогноз за сценарієм {scenario}; клас, що займає найбільшу частину області.',
  },
  layers: {
    water: {
      name: 'Вода',
      legendTitle: 'Водний стрес: яку частку доступної води забирають люди',
      low: 'Низький',
      high: 'Надзвичайно високий',
      norm: 'середнє 1990–2019',
      mean: 'За рік',
      meanPeriod: 'За період',
      normValue: 'середнє 1990–2019',
      unit: '%',
      chartTitle: 'Частка доступної води, яку забирають люди, і прогноз до 2080',
      story: {
        norm: 'У {norm} люди {where} забирали в середньому {value} доступної води.',
        observed: 'У {year} році люди {where} забирали {value} доступної води, {delta}.',
        observedShort: 'У {year} році — {value}, {delta}.',
        future: 'У {period} очікується {value}{range}, {delta}.',
        above: 'більше, ніж у середньому за 1990–2019',
        below: 'менше, ніж у середньому за 1990–2019',
        same: 'як у середньому за 1990–2019',
      },
      futureNote:
        'Майбутнє — середнє за 30 років навколо названого року (медіана 5 кліматичних моделей WRI Aqueduct), а не прогноз на конкретний рік. Історія — модель PCR-GLOBWB: забір води по роках, доступна вода — середня за 1979–2019.',
      models: { one: '{n} кліматичної моделі', other: '{n} кліматичних моделей' },
    },
    temp: {
      name: 'Температура',
      legendTitle: 'Середня температура року відносно норми 1991–2020',
      low: 'Холодніше',
      high: 'Тепліше',
      norm: 'норма',
      mean: 'Середня за рік',
      meanPeriod: 'Середня за період',
      normValue: 'норма',
      unit: '°C',
      chartTitle: 'Відхилення середньої температури року від норми і прогноз до 2100',
      story: {
        norm: 'У {norm} середня температура {where} була {value}.',
        observed: 'У {year} році середня температура {where} була {value}, {delta}.',
        observedShort: 'У {year} році — {value}, {delta}.',
        future: 'У {period} очікується {value}{range}, {delta}.',
        above: 'на {delta} вище за норму',
        below: 'на {delta} нижче за норму',
        same: 'як у нормі',
      },
      /** `{models}`: the count, worded by `models`. */
      futureNote:
        'Майбутнє — середнє за 20 років, а не прогноз на конкретний рік: медіана {models}, у дужках — діапазон, у який потрапляють 80 % моделей.',
      models: { one: '{n} кліматичної моделі', other: '{n} кліматичних моделей' },
    },
    heat: {
      name: 'Сильна спека',
      legendTitle: 'Дні сильної спеки (понад 35 °C) за рік',
      low: 'Мало',
      high: 'Багато',
      norm: 'норма',
      mean: 'За рік',
      meanPeriod: 'За період',
      normValue: 'норма',
      unit: { one: 'день', few: 'дні', many: 'днів', other: 'дня' },
      chartTitle: 'Дні сильної спеки (понад 35 °C) по роках і прогноз до 2100',
      story: {
        norm: 'У {norm} {where} було в середньому {value} сильної спеки на рік.',
        observed: 'У {year} році {where} було {value} сильної спеки, {delta}.',
        observedShort: 'У {year} році — {value}, {delta}.',
        future: 'У {period} очікується {value}{range}, {delta}.',
        above: 'на {delta} більше, ніж у нормі',
        below: 'на {delta} менше, ніж у нормі',
        same: 'як у нормі',
      },
      futureNote:
        'Майбутнє — середнє за 20 років, а не прогноз на конкретний рік: медіана {models}, у дужках — діапазон, у який потрапляють 80 % моделей.',
      models: { one: '{n} кліматичної моделі', other: '{n} кліматичних моделей' },
    },
    frost: {
      name: 'Морози',
      legendTitle: 'Морозні дні (мінімум нижче 0 °C) за рік',
      low: 'Мало',
      high: 'Багато',
      norm: 'норма',
      mean: 'За рік',
      meanPeriod: 'За період',
      normValue: 'норма',
      unit: { one: 'день', few: 'дні', many: 'днів', other: 'дня' },
      chartTitle: 'Морозні дні по роках і прогноз до 2100',
      story: {
        norm: 'У {norm} {where} було в середньому {value} з морозом на рік.',
        observed: 'У {year} році {where} було {value} з морозом, {delta}.',
        observedShort: 'У {year} році — {value}, {delta}.',
        future: 'У {period} очікується {value}{range}, {delta}.',
        above: 'на {delta} більше, ніж у нормі',
        below: 'на {delta} менше, ніж у нормі',
        same: 'як у нормі',
      },
      futureNote:
        'Майбутнє — середнє за 20 років, а не прогноз на конкретний рік: медіана {models}, у дужках — діапазон, у який потрапляють 80 % моделей.',
      models: { one: '{n} кліматичної моделі', other: '{n} кліматичних моделей' },
    },
    drought: {
      name: 'Посуха',
      legendTitle: 'Посушливі місяці за рік (індекс SPEI-6 нижче −1)',
      low: 'Мало',
      high: 'Багато',
      norm: 'норма',
      mean: 'За рік',
      meanPeriod: 'За період',
      normValue: 'норма',
      unit: { one: 'місяць', few: 'місяці', many: 'місяців', other: 'місяця' },
      chartTitle: 'Посушливі місяці по роках і прогноз до 2100',
      story: {
        norm: 'У {norm} {where} було в середньому {value} посухи на рік.',
        observed: 'У {year} році {where} було {value} посухи, {delta}.',
        observedShort: 'У {year} році — {value}, {delta}.',
        future: 'У {period} очікується {value}{range}, {delta}.',
        above: 'на {delta} більше, ніж у нормі',
        below: 'на {delta} менше, ніж у нормі',
        same: 'як у нормі',
      },
      futureNote:
        'Майбутнє — середнє за 20 років, а не прогноз на конкретний рік: медіана {models}, у дужках — діапазон, у який потрапляють 80 % моделей.',
      models: { one: '{n} кліматичної моделі', other: '{n} кліматичних моделей' },
    },
    rivers: {
      name: 'Річки',
      legendTitle: 'Дні маловоддя за рік',
      low: 'Немає',
      high: 'Багато',
      norm: 'середнє 1997–2025',
      mean: 'За рік',
      meanPeriod: 'За період',
      normValue: 'середнє 1997–2025',
      unit: { one: 'день', few: 'дні', many: 'днів', other: 'дня' },
      chartTitle: 'Дні маловоддя по роках, 1997–2025',
      story: {
        norm: 'У {norm} {where} було в середньому {value} маловоддя на рік.',
        observed: 'У {year} році {where} було {value} маловоддя, {delta}.',
        observedShort: 'У {year} році — {value}, {delta}.',
        future: 'У {period} очікується {value}{range}, {delta}.',
        above: 'на {delta} більше, ніж у середньому',
        below: 'на {delta} менше, ніж у середньому',
        same: 'як у середньому',
      },
      futureNote:
        'День маловоддя — коли води в річці менше, ніж у 9 з 10 таких самих днів 1997–2020 (модельні витрати GloFAS v4).',
      models: { one: '{n} модель', other: '{n} моделей' },
    },
  },
  tooltip: {
    range: 'від {low} до {high}',
    noData: 'Немає даних',
  },
  timeline: {
    label: 'Рік або період',
    play: 'Програти зміни в часі',
    pause: 'Пауза',
    forecast: 'прогноз',
    observed: 'спостереження',
    future: 'Майбутнє',
    scenario: 'Сценарій прогнозу',
  },
}

export type Messages = typeof uk
