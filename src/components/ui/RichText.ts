import { h, type FunctionalComponent } from 'vue'

import type { Rich } from '../../lib/narrative'

/**
 * A sentence from `lib/narrative`, with its numbers in bold. A render function, so no template
 * whitespace slips between the runs.
 */
export const RichText: FunctionalComponent<{ text: Rich }> = ({ text }) =>
  text.map((segment) =>
    segment.strong
      ? h('strong', { class: 'font-semibold tabular-nums' }, segment.text)
      : segment.text,
  )
RichText.props = ['text']
