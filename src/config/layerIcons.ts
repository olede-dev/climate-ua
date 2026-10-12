import type { LayerId } from '../types'

/** Icon paths (24-unit grid) and tile colours of the layers, shared by the layer list and the about dialog. */
export const LAYER_ICONS: Record<LayerId, string> = {
  waterbodies: 'M3 8c3-4 6 4 9 0s6 4 9 0M3 16c3-4 6 4 9 0s6 4 9 0',
  water: 'M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11z',
  temp: 'M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0zM12 9v8',
  heat: 'M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  frost: 'M12 2v20M4.93 7l14.14 10M4.93 17L19.07 7M9 4l3 3 3-3M9 20l3-3 3 3',
  drought: 'M3 21h18M5 17l3-4 3 2 3-5 2 3 3-2M12 3v3M7 5l1.5 2M17 5l-1.5 2',
  // A snowflake; the snow-water layers pair a smaller one with a peak arrow or a calendar day.
  'snow-days': 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9',
  'snow-max': 'M9 3v10M4.7 5.5l8.6 5M4.7 10.5l8.6-5M19 21V9M16 12l3-3 3 3',
  'snow-march': 'M9 3v10M4.7 5.5l8.6 5M4.7 10.5l8.6-5M15 15h6v6h-6zM15 17.5h6',
  rivers:
    'M2 6c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M2 12c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M2 18c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2',
}
export const LAYER_TONES: Record<LayerId, string> = {
  waterbodies: 'bg-sky-600',
  water: 'bg-blue-500',
  temp: 'bg-red-500',
  heat: 'bg-orange-500',
  frost: 'bg-cyan-500',
  drought: 'bg-amber-500',
  'snow-days': 'bg-indigo-400',
  'snow-max': 'bg-indigo-400',
  'snow-march': 'bg-indigo-400',
  rivers: 'bg-teal-500',
}
