// Downloads today's discharge and ensemble forecast for every station of rivers.json once and
// writes public/data/discharge-snapshot.json. The site paints it first and falls back to it
// when Open-Meteo refuses or fails. CI runs it before every build; the file is not in git.
import { readFile, writeFile } from 'node:fs/promises'

import type { DischargeSnapshotFile } from '../src/api/discharge'
import { fetchDischarge } from '../src/api/flood'
import { DISCHARGE_WINDOW, SNAPSHOT_PATH } from '../src/config/discharge'
import { todayKyiv } from '../src/lib/river/dates'
import type { RiversFile } from '../src/types'

const TIMEOUT_MS = 60_000
const RIVERS = new URL('../public/data/rivers.json', import.meta.url)
const OUTPUT = new URL(`../public/${SNAPSHOT_PATH}`, import.meta.url)

const rivers = JSON.parse(await readFile(RIVERS, 'utf8')) as RiversFile
const stations = rivers.stations.map((s) => ({ id: s.id, ...s.cell }))
const series = await fetchDischarge(stations, DISCHARGE_WINDOW, { timeoutMs: TIMEOUT_MS })
const output: DischargeSnapshotFile = {
  fetchedOn: todayKyiv(),
  window: DISCHARGE_WINDOW,
  stations: Object.fromEntries(series),
}
await writeFile(OUTPUT, `${JSON.stringify(output)}\n`)
console.log(`Wrote ${series.size} stations to ${OUTPUT.pathname}`)
