import type { Locale } from '../i18n'

/** A Köppen–Geiger class in plain words: its name and what it means for a person. */
export interface KoppenText {
  name: string
  meaning: string
}

type Texts = Record<Locale, KoppenText>

/**
 * The classes that cover an oblast now or later (`public/data/koppen.json`) and their likely
 * neighbours. Thresholds follow Beck et al. (2023): C and D part at a coldest month of 0 °C,
 * `a` summers have a month above 22 °C.
 */
const CLASSES: Record<string, Texts> = {
  Dfb: {
    uk: {
      name: 'помірно-континентальний з теплим літом',
      meaning: 'Морозна сніжна зима і тепле, але не спекотне літо.',
    },
    en: {
      name: 'humid continental with warm summers',
      meaning: 'Frosty, snowy winters and warm but not hot summers.',
    },
  },
  Dfa: {
    uk: {
      name: 'континентальний зі спекотним літом',
      meaning:
        'Зима ще морозна, але літо спекотне: найтепліший місяць у середньому тепліший за 22 °C.',
    },
    en: {
      name: 'humid continental with hot summers',
      meaning: 'Winters still freeze, but summers are hot: the warmest month averages above 22 °C.',
    },
  },
  Dfc: {
    uk: {
      name: 'субарктичний з коротким прохолодним літом',
      meaning: 'Довга холодна зима і коротке прохолодне літо, як зараз високо в Карпатах.',
    },
    en: {
      name: 'subarctic with short cool summers',
      meaning: 'Long cold winters and short cool summers, as high in the Carpathians today.',
    },
  },
  Cfa: {
    uk: {
      name: 'вологий субтропічний',
      meaning:
        'Зима м’яка: найхолодніший місяць у середньому вище 0 °C, сніг лежить недовго. Літо спекотне.',
    },
    en: {
      name: 'humid subtropical',
      meaning:
        'Mild winters: the coldest month averages above 0 °C and snow does not last. Hot summers.',
    },
  },
  Cfb: {
    uk: {
      name: 'помірний морський',
      meaning: 'М’яка зима без тривалих морозів і тепле, не спекотне літо.',
    },
    en: {
      name: 'temperate oceanic',
      meaning: 'Mild winters without long frosts and warm, not hot, summers.',
    },
  },
  Csa: {
    uk: {
      name: 'середземноморський',
      meaning: 'Сухе спекотне літо і м’яка дощова зима.',
    },
    en: {
      name: 'Mediterranean',
      meaning: 'Dry, hot summers and mild, rainy winters.',
    },
  },
  BSk: {
    uk: {
      name: 'посушливий степовий',
      meaning: 'Опадів менше, ніж може випаруватися: без зрошення більшості культур бракує вологи.',
    },
    en: {
      name: 'cold semi-arid steppe',
      meaning: 'Less rain falls than could evaporate: most crops need irrigation.',
    },
  },
  BSh: {
    uk: {
      name: 'жаркий степовий',
      meaning: 'Спекотно й сухо майже весь рік; без зрошення землеробство майже неможливе.',
    },
    en: {
      name: 'hot semi-arid steppe',
      meaning: 'Hot and dry most of the year; farming hardly works without irrigation.',
    },
  },
  ET: {
    uk: {
      name: 'гірська тундра',
      meaning: 'Навіть найтепліший місяць холодніший за 10 °C; дерева не ростуть.',
    },
    en: {
      name: 'alpine tundra',
      meaning: 'Even the warmest month stays below 10 °C; trees do not grow.',
    },
  },
}

/** By main group, for a class not listed above. */
const GROUPS: Record<string, Texts> = {
  A: {
    uk: { name: 'тропічний', meaning: 'Спекотно цілий рік.' },
    en: { name: 'tropical', meaning: 'Hot all year round.' },
  },
  B: {
    uk: { name: 'посушливий', meaning: 'Опадів менше, ніж може випаруватися.' },
    en: { name: 'arid', meaning: 'Less rain falls than could evaporate.' },
  },
  C: {
    uk: { name: 'помірний', meaning: 'Зима без стійких морозів.' },
    en: { name: 'temperate', meaning: 'Winters without lasting frost.' },
  },
  D: {
    uk: { name: 'континентальний', meaning: 'Морозна зима і тепле літо.' },
    en: { name: 'continental', meaning: 'Freezing winters and warm summers.' },
  },
  E: {
    uk: { name: 'полярний', meaning: 'Холодно навіть улітку.' },
    en: { name: 'polar', meaning: 'Cold even in summer.' },
  },
}

/** Plain-language name and meaning of a class such as `Dfb`; null for an unknown code. */
export function koppenText(code: string, locale: Locale): KoppenText | null {
  return (CLASSES[code] ?? GROUPS[code.charAt(0)])?.[locale] ?? null
}
