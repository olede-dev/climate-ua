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
