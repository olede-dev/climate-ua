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
    status:
      'Work in progress: the map shows the Water and Temperature layers; other layers follow.',
  },
  home: {
    map: 'Map',
    loadError: 'The map data could not be loaded. Reload the page.',
    panel: 'About the map',
    layers: 'Map layer',
    hotspots: 'Hotspots',
    hotspotsHint:
      'Show the subbasins where people withdraw more than {value} of the available water',
  },
  panel: {
    country: 'Ukraine',
    pickRegion: 'Click a region to see its history and projection.',
    pickBasin: 'Click a subbasin to see its history and projection.',
    close: 'Close the region card',
    loading: 'Loading the chart',
  },
  scenarios: {
    'SSP2-4.5': 'Projections follow scenario SSP2-4.5: the world cuts emissions slowly.',
    'SSP3-7.0':
      'Projections follow scenario SSP3-7.0, which WRI calls “business as usual”: things go on as they are.',
  },
  story: {
    country: 'in Ukraine',
    range: ' ({low} to {high})',
    missingYear: 'There is no data for {year}.',
    missingPeriod: 'There is no projection for {period}.',
  },
  chart: {
    now: 'Now',
    norm: 'norm',
    aria: '{title}: bars by year {from}–{to}, then projections by period up to {end}.',
  },
  basin: {
    named: '{river} basin',
    namedWhere: 'in the {river} basin',
    unnamed: 'Subbasin {where}',
    unnamedWhere: 'in this subbasin',
    sectors: 'What the water was withdrawn for in {year}',
    irrigation: 'Irrigation',
    domestic: 'Households',
    industrial: 'Industry',
    kakhovka:
      'The Kakhovka Reservoir was destroyed in June 2023. Neither the data (up to 2019) nor the projections reflect this.',
  },
  layers: {
    water: {
      name: 'Water',
      legendTitle: 'Water stress: the share of available water people withdraw',
      low: 'Low',
      high: 'Extremely high',
      norm: '1990–2019 mean',
      mean: 'Year',
      meanPeriod: 'Period',
      normValue: '1990–2019 mean',
      chartTitle: 'Share of the available water people withdraw, with projections to 2080',
      story: {
        norm: 'In {norm}, people {where} withdrew {value} of the available water on average.',
        observed: 'In {year}, people {where} withdrew {value} of the available water, {delta}.',
        observedShort: 'In {year}, it was {value}, {delta}.',
        future: 'For {period}, the projection is {value}{range}, {delta}.',
        above: 'more than the 1990–2019 average',
        below: 'less than the 1990–2019 average',
        same: 'in line with the 1990–2019 average',
      },
      futureNote:
        'The future is a 30-year average around the year named (the median of 5 climate models in WRI Aqueduct), not a forecast for that year. The history comes from the PCR-GLOBWB model: withdrawals by year, available water as the 1979–2019 mean.',
      models: { one: '{n} climate model', other: '{n} climate models' },
    },
    temp: {
      name: 'Temperature',
      legendTitle: 'Mean annual temperature compared with the 1991–2020 norm',
      low: 'Colder',
      high: 'Warmer',
      norm: 'norm',
      mean: 'Annual mean',
      meanPeriod: 'Period mean',
      normValue: 'norm',
      chartTitle: 'Annual mean temperature against the norm, with projections to 2100',
      story: {
        norm: 'In {norm}, the mean temperature {where} was {value}.',
        observed: 'In {year}, the mean temperature {where} was {value}, {delta}.',
        observedShort: 'In {year}, it was {value}, {delta}.',
        future: 'For {period}, the projection is {value}{range}, {delta}.',
        above: '{delta} above the norm',
        below: '{delta} below the norm',
        same: 'in line with the norm',
      },
      futureNote:
        'The future is a 20-year average, not a forecast for any one year: the median of {models}; the brackets give the range 80% of the models fall in.',
      models: { one: '{n} climate model', other: '{n} climate models' },
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
