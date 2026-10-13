/** How a figure reads against what is usual: in the direction that matters, or not graded. */
export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

/** Badge and marker classes per tone, shared by every list and card that grades a figure. */
export const TONE_CLASSES: Record<Tone, { badge: string; dot: string }> = {
  bad: { badge: 'bg-red-500/15 text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  warn: { badge: 'bg-warn-fill text-warn-ink', dot: 'bg-warn' },
  neutral: { badge: 'bg-fill text-ink-muted', dot: 'bg-ink-muted/40' },
  good: {
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
}
