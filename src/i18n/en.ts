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
    intro:
      'The map shows how the climate and water resources of Ukraine have changed and what to expect next. Every number comes from a model: a reanalysis, a hydrological model or climate models, not from readings at individual weather stations.',
    sections: [
      {
        heading: 'The past',
        paragraphs: [
          'Temperature, extreme heat, frost and drought come from the ERA5 reanalysis, year by year since 1950. A region’s value is the mean over the grid cells (~25 km), weighted by how much of each cell lies in the region. The norm is 1991–2020.',
          'Water comes from the PCR-GLOBWB 2 hydrological model of Utrecht University as the World Water Map shows it: demand and the gap by year, 1980–2019, on 265 HydroBASINS level 7 subbasins. Rivers come from the GloFAS v4 reanalysis, 1997–2025.',
        ],
      },
      {
        heading: 'The future',
        paragraphs: [
          'Climate models do not forecast the weather of a given year: 2047 in a model is just one possible year. So the climate layers show the future as a 20-year mean (2021–2040, 2041–2060, 2081–2100): the median of 17–23 CMIP6 models (depending on the measure), with the range that 80% of the models fall in in brackets.',
          'The World Water Map projects the water gap year by year, 2020–2050. The map shows the mean of the climate models; the card and the chart add their spread, from the lowest to the highest. Read a single projected year as a trend, not a forecast of that very year. There is no projection of demand or of the gap by sector.',
        ],
      },
      {
        heading: 'Scenarios',
        paragraphs: [
          'Climate layers use SSP2-4.5: the world cuts emissions slowly.',
          'Water offers the three World Water Map scenarios: “Sustainable” (SSP1-2.6, the least warming), “Nationalist” (SSP3-7.0, a fragmented world) and “Fossil-powered” (SSP5-8.5, the most warming). SSP2-4.5 is not among them, so water and climate projections should not be compared directly.',
        ],
      },
      {
        heading: 'The delta method',
        paragraphs: [
          'Every model is off in its own way: one runs warmer than reality overall, another colder. So only the change is taken from a model: future = observed norm + (model in the future − model in the baseline). The change is computed for each model, then the median is taken. This keeps charts from jumping where the past meets the future. Days and months are clipped to what is possible (0–365 days, 0–12 months). For heat and frost the change is also scaled: the models had three times the hot days of ERA5, so a model with twice the real number of such days in 1991–2020 adds half its change.',
        ],
      },
    ],
    measuresHeading: 'What each layer means',
    measures: [
      {
        name: 'Water',
        text: 'demand: how much water irrigation, households and industry need in a year; the gap: the part of the demand that renewable water from rivers and rain does not cover (demand minus withdrawal, as on the World Water Map). Both are in km³ for the part of each subbasin inside Ukraine; all of Ukraine is their sum. The map runs from dark green (little) to red (much), scaled on every subbasin and year.',
      },
      {
        name: 'Temperature',
        text: 'mean annual temperature; the map shows its departure from the 1991–2020 norm.',
      },
      { name: 'Extreme heat', text: 'days with a maximum temperature above 35 °C.' },
      { name: 'Frost', text: 'days with a minimum temperature below 0 °C.' },
      {
        name: 'Drought',
        text: 'months with SPEI-6 below −1 (moderate drought or worse), averaged over the region. The C3S Atlas standardises the index on 1971–2005 (1971–2010 for ERA5), not on 1991–2020.',
      },
      {
        name: 'Rivers',
        text: 'low-flow days: a river carries less water than on 9 in 10 of the same days of 1997–2020. There is no projection for rivers.',
      },
      {
        name: 'Climate type',
        text: 'the Köppen–Geiger classification by Beck et al. (2023) on a 1 km grid; for a region, the class covering most of it.',
      },
    ],
    limitsHeading: 'Limitations',
    limits: [
      'All data are modelled. Conditions in a particular town or village may differ from the mean of its region or subbasin.',
      'Climate models have a resolution of about 100 km: a small region is covered by only 1–3 cells.',
      'The Kakhovka Reservoir was destroyed in June 2023. The water data (to 2019) and the World Water Map projection do not reflect this; the cards of the lower Dnipro subbasins carry a note.',
      'There are no ground observations from the temporarily occupied territories, but every source is a gridded model, so the map covers all of Ukraine, Crimea included.',
    ],
    sourcesHeading: 'Sources',
    sources: [
      {
        name: 'Utrecht University, World Water Map (PCR-GLOBWB 2)',
        detail: 'Sutanudjaja et al. (2018), CC BY 4.0',
        url: 'https://doi.org/10.24416/UU01-0Q6SU6',
      },
      {
        name: 'National Geographic Society, World Water Map',
        detail: 'the World Water Map site’s data: subbasins, the gap and the projection to 2050',
        url: 'https://worldwatermap.nationalgeographic.org/',
      },
      {
        name: 'Copernicus Interactive Climate Atlas',
        detail: 'C3S / ECMWF: ERA5, CMIP6; CC BY 4.0',
        url: 'https://atlas.climate.copernicus.eu/',
      },
      {
        name: 'Beck et al. (2023), Scientific Data 10, 724',
        detail: 'Köppen–Geiger maps, CC BY 4.0',
        url: 'https://doi.org/10.1038/s41597-023-02549-6',
      },
      {
        name: 'GloFAS v4',
        detail: 'Copernicus Emergency Management Service, reanalysis via Open-Meteo',
        url: 'https://open-meteo.com/en/docs/flood-api',
      },
      {
        name: 'geoBoundaries and Natural Earth',
        detail:
          'region boundaries: © OpenStreetMap, ODbL; river names for the subbasins: Natural Earth',
        url: 'https://www.geoboundaries.org/',
      },
    ],
    code: 'Code and data pipeline',
  },
  home: {
    map: 'Map',
    loadError: 'The map data could not be loaded. Reload the page.',
    panel: 'About the map',
    layers: 'Map layer',
    hideLayers: 'Hide layers',
    showLayers: 'Show layers',
  },
  table: {
    oblasts: 'Oblast',
    basins: 'Subbasin',
    stations: 'Station',
    value: 'Value',
    hint: 'Pick a region to open its card.',
  },
  panel: {
    /** `{year}`: the end of the last projection period. */
    futureHint: 'Projection to {year}',
    back: 'Ukraine',
    rank: 'Place {place} of {of} by size',
    usual: 'Usually',
    now: 'selected year',
    /** `{delta}`. */
    moreThanUsual: '{delta} more than usual',
    lessThanUsual: '{delta} less than usual',
    aboutData: 'About the projection and data',
    pickRegion: 'Click a region to see its history and projection.',
    pickStation: 'Click a point on a river to see its history.',
    close: 'Close the region card',
    loading: 'Loading the chart',
  },
  scenarios: {
    'SSP2-4.5': 'Projections follow scenario SSP2-4.5: the world cuts emissions slowly.',
  },
  story: {
    country: 'in Ukraine',
    range: ' ({low} to {high})',
    missingYear: 'There is no data for {year}.',
    missingPeriod: 'There is no projection for {period}.',
    noForecast: 'There are no projections for rivers.',
    stations: 'across {n} river stations on average',
  },
  chart: {
    now: 'Now',
    norm: 'norm',
    aria: '{title}: bars by year {from}–{to}, then projections by period up to {end}.',
    ariaHistory: '{title}: bars by year {from}–{to}.',
    ariaYearly:
      '{title}: bars by year {from}–{to}, then the models’ mean and range by year up to {end}.',
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
  station: {
    name: '{river} at {place}',
    where: 'on the {river} at {place}',
  },
  koppen: {
    title: 'Köppen climate type',
    now: 'The region’s climate today: {name} ({code}).',
    future: 'In {period}: {name} ({code}).',
    same: 'In {period} the Köppen climate type stays the same.',
    note: 'Climate type after Beck et al. (2023), projected under scenario {scenario}; the class covering most of the region.',
  },
  waterUse: {
    scenariosLabel: 'Scenario',
    layerDescription: 'Water gap and demand, the gap projected to 2050',
    views: { gap: 'Water gap', demand: 'Water demand' },
    noGap: 'No gap: rivers and rain cover the demand',
    viewsLabel: 'What to show',
    future: 'Future scenarios',
    futureHint: 'Water gap up to 2050',
    futureCard: {
      lead: 'In {year}, the water gap in Ukraine will be',
      past: 'In {year} it was {value}',
      boundsLabel: 'Climate model range',
      bounds: { min: 'Min', max: 'Max' },
      boundsHint:
        'The lowest or highest value among the climate models; the map shows the one chosen.',
    },
    scenarios: {
      'SSP1-2.6': {
        name: 'Sustainable',
        about:
          'The world develops with less inequality, slower population growth and less harm to the environment; warming is lowest.',
      },
      'SSP3-7.0': {
        name: 'Nationalist',
        about:
          'A fragmented, unequal world with conflict, fast population growth in developing countries and little care for the environment; warming is relatively high.',
      },
      'SSP5-8.5': {
        name: 'Fossil-powered',
        about: 'A world of high growth and trade, powered by fossil fuels; warming is highest.',
      },
    },
    back: 'Back to history',
    sectorsLabel: 'What the water is for',
    noForecast:
      'There are no projections of demand or the gap; the future is in “Future scenarios”.',
    intro: {
      gap: 'The gap is the part of the demand that renewable water from rivers and rain does not cover.',
      demand:
        'Demand is how much water people need in a year, including what flows back into rivers.',
    },
    sectors: {
      total: {
        name: 'Total',
        use: 'for all uses',
        about: 'Irrigation, households and industry together.',
      },
      irrigation: {
        name: 'Irrigation',
        use: 'for irrigation',
        about: 'Fields in southern Ukraine are watered mostly from the Dnipro through canals.',
      },
      domestic: {
        name: 'Domestic',
        use: 'for households',
        about: 'Water at home: drinking, washing, laundry and watering gardens.',
      },
      industrial: {
        name: 'Industrial',
        use: 'for industry',
        about: 'Cooling power plants, steel, chemicals and mining.',
      },
    },
    /** `{use}`: a sector's `use`. */
    gap: {
      legendTitle: 'Water gap {use}',
      chartTitle: 'Water gap, km³',
      story: {
        observed: 'In {year}, the water gap {use} {where} was {value}, {delta}.',
        future: '{period}: —.',
        above: 'more than the 1990–2019 average',
        below: 'less than the 1990–2019 average',
        same: 'the same as the 1990–2019 average',
      },
    },
    demand: {
      legendTitle: 'Water demand {use}',
      chartTitle: 'Water demand, km³',
      story: {
        observed: 'In {year}, water demand {use} {where} was {value}, {delta}.',
        future: '{period}: —.',
        above: 'more than the 1990–2019 average',
        below: 'less than the 1990–2019 average',
        same: 'the same as the 1990–2019 average',
      },
    },
    units: { gap: 'km³', demand: 'km³' },
    low: 'Little',
    high: 'A lot',
    norm: '1990–2019 average',
    note: 'The PCR-GLOBWB model (Utrecht University, World Water Map): 1980–2019 and the water gap projected to 2050. Volumes are for the part of each subbasin inside Ukraine.',
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
      unit: '%',
      chartTitle: 'Share of the available water people withdraw, with projections to 2080',
      story: {
        observed: 'In {year}, people {where} withdrew {value} of the available water, {delta}.',
        future: 'For {period}, the projection is {value}{range}, {delta}.',
        above: 'more than the 1990–2019 average',
        below: 'less than the 1990–2019 average',
        same: 'in line with the 1990–2019 average',
      },
      futureNote:
        'The PCR-GLOBWB model (Utrecht University, World Water Map): 1980–2019 and the gap projected to 2050, the mean of the climate models.',
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
      unit: '°C',
      chartTitle: 'Annual mean temperature against the norm, with projections to 2100',
      story: {
        observed: 'In {year}, the mean temperature {where} was {value}, {delta}.',
        future: 'For {period}, the projection is {value}{range}, {delta}.',
        above: '{delta} above the norm',
        below: '{delta} below the norm',
        same: 'in line with the norm',
      },
      futureNote:
        'The future is a 20-year average, not a forecast for any one year: the median of {models}; the brackets give the range 80% of the models fall in.',
      models: { one: '{n} climate model', other: '{n} climate models' },
    },
    heat: {
      name: 'Extreme heat',
      legendTitle: 'Days of extreme heat (above 35 °C) a year',
      low: 'Few',
      high: 'Many',
      norm: 'norm',
      mean: 'Year',
      meanPeriod: 'Period',
      normValue: 'norm',
      unit: { one: 'day', few: 'days', many: 'days', other: 'days' },
      chartTitle: 'Days of extreme heat (above 35 °C) by year, with projections to 2100',
      story: {
        observed: 'In {year}, there were {value} of extreme heat {where}, {delta}.',
        future: 'For {period}, the projection is {value}{range}, {delta}.',
        above: '{delta} more than the norm',
        below: '{delta} fewer than the norm',
        same: 'in line with the norm',
      },
      futureNote:
        'The future is a 20-year average, not a forecast for any one year: the median of {models}; the brackets give the range 80% of the models fall in.',
      models: { one: '{n} climate model', other: '{n} climate models' },
    },
    frost: {
      name: 'Frost',
      legendTitle: 'Frost days (minimum below 0 °C) a year',
      low: 'Few',
      high: 'Many',
      norm: 'norm',
      mean: 'Year',
      meanPeriod: 'Period',
      normValue: 'norm',
      unit: { one: 'frost day', few: 'frost days', many: 'frost days', other: 'frost days' },
      chartTitle: 'Frost days by year, with projections to 2100',
      story: {
        observed: 'In {year}, there were {value} {where}, {delta}.',
        future: 'For {period}, the projection is {value}{range}, {delta}.',
        above: '{delta} more than the norm',
        below: '{delta} fewer than the norm',
        same: 'in line with the norm',
      },
      futureNote:
        'The future is a 20-year average, not a forecast for any one year: the median of {models}; the brackets give the range 80% of the models fall in.',
      models: { one: '{n} climate model', other: '{n} climate models' },
    },
    drought: {
      name: 'Drought',
      legendTitle: 'Dry months a year (SPEI-6 below −1)',
      low: 'Few',
      high: 'Many',
      norm: 'norm',
      mean: 'Year',
      meanPeriod: 'Period',
      normValue: 'norm',
      unit: { one: 'dry month', few: 'dry months', many: 'dry months', other: 'dry months' },
      chartTitle: 'Dry months by year, with projections to 2100',
      story: {
        observed: 'In {year}, there were {value} {where}, {delta}.',
        future: 'For {period}, the projection is {value}{range}, {delta}.',
        above: '{delta} more than the norm',
        below: '{delta} fewer than the norm',
        same: 'in line with the norm',
      },
      futureNote:
        'The future is a 20-year average, not a forecast for any one year: the median of {models}; the brackets give the range 80% of the models fall in.',
      models: { one: '{n} climate model', other: '{n} climate models' },
    },
    rivers: {
      name: 'Rivers',
      legendTitle: 'Low-flow days a year',
      low: 'None',
      high: 'Many',
      norm: '1997–2025 average',
      mean: 'Year',
      meanPeriod: 'Period',
      normValue: '1997–2025 average',
      unit: {
        one: 'low-flow day',
        few: 'low-flow days',
        many: 'low-flow days',
        other: 'low-flow days',
      },
      chartTitle: 'Low-flow days by year, 1997–2025',
      story: {
        observed: 'In {year}, there were {value} {where}, {delta}.',
        future: 'For {period}, the projection is {value}{range}, {delta}.',
        above: '{delta} more than on average',
        below: '{delta} fewer than on average',
        same: 'in line with the average',
      },
      futureNote:
        'A low-flow day is one with less water in the river than on 9 in 10 of the same calendar days in 1997–2020 (GloFAS v4 modelled discharge).',
      models: { one: '{n} model', other: '{n} models' },
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
