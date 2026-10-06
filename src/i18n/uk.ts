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
    status: 'Проєкт у розробці: зараз на карті шар «Температура», інші шари з’являться далі.',
  },
  home: {
    map: 'Карта',
    loadError: 'Не вдалося завантажити дані карти. Оновіть сторінку.',
    panel: 'Пояснення до карти',
  },
  panel: {
    country: 'Україна',
    pickRegion: 'Натисніть на область, щоб побачити її історію і прогноз.',
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
  },
  chart: {
    now: 'Зараз',
    norm: 'норма',
    /** `{title}`, `{from}`, `{to}`, `{end}`. */
    aria: '{title}: стовпчики по роках {from}–{to}, далі прогноз періодами до {end}.',
  },
  layers: {
    temp: {
      name: 'Температура',
      legendTitle: 'Середня температура року відносно норми 1991–2020',
      low: 'Холодніше',
      high: 'Тепліше',
      norm: 'норма',
      mean: 'Середня за рік',
      meanPeriod: 'Середня за період',
      normValue: 'норма',
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
