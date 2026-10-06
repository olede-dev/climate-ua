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
    status: 'Проєкт у розробці: шари з даними з’являться на наступних етапах.',
  },
  home: {
    map: 'Карта',
    comingSoon: 'Шари з даними — незабаром',
  },
}

export type Messages = typeof uk
