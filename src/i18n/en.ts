import type { Messages } from './uk'

export const en: Messages = {
  htmlLang: 'en',
  documentTitle: 'Climate of Ukraine — past and future',
  documentDescription:
    'How the climate and water resources of Ukraine have changed since 1950 and what to expect by the end of the century.',

  header: {
    title: 'Climate of Ukraine',
    titleSuffix: ' — past and future',
    subtitleShort: 'Past and future',
    subtitleLong: 'Water, heat, frost and drought by region',
  },
  theme: {
    label: 'Theme',
    menuLabel: 'Colour theme',
    auto: 'Auto',
    light: 'Light',
    dark: 'Dark',
  },
  language: {
    label: 'Language',
    menuLabel: 'Interface language',
  },
  footer: {
    map: 'Map:',
    about: 'About the data and method',
  },
  about: {
    heading: 'About the data',
    close: 'Close',
    statusHeading: 'Project status',
    status: 'Work in progress: the map shows the Temperature layer; other layers follow.',
  },
  home: {
    map: 'Map',
    loadError: 'The map data could not be loaded. Reload the page.',
  },
  layers: {
    temp: {
      name: 'Temperature',
      legendTitle: 'Mean annual temperature compared with the 1991–2020 norm',
      low: 'Colder',
      high: 'Warmer',
      norm: 'norm',
      mean: 'Annual mean',
      meanPeriod: 'Period mean',
      normValue: 'norm',
    },
  },
  tooltip: {
    range: '{low} to {high}',
    noData: 'No data',
  },
  timeline: {
    label: 'Year or period',
    play: 'Play the changes over time',
    pause: 'Pause',
    forecast: 'projection',
    observed: 'observed',
    future: 'Future',
    scenario: 'Projection scenario',
  },
}
