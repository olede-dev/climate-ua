// Screenshots every layer's map, light and dark, into public/layer-previews/ for the layer picker.
// Needs the dev server on DEV_URL, Google Chrome and `cwebp`:
//   npm run dev -- --port 5192 && node scripts/layer-previews.mjs
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEV_URL = process.env.DEV_URL ?? 'http://localhost:5192/climate-ua/'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'public/layer-previews'
const LAYERS = [
  'water',
  'rivers',
  'waterbodies',
  'temp',
  'heat',
  'frost',
  'drought',
  'snow-days',
  'snow-max',
  'snow-march',
]
// The wide layout frames Ukraine right of the sidebar and above the time bar.
const CLIP = { x: 390, y: 60, width: 1000, height: 625, scale: 1 }
const SETTLE_MS = 9000

const work = mkdtempSync(join(tmpdir(), 'layer-previews-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--use-angle=metal',
  '--hide-scrollbars',
  '--remote-debugging-port=9333',
  '--window-size=1400,900',
  `--user-data-dir=${join(work, 'profile')}`,
  'about:blank',
])
try {
  await sleep(2000)
  const targets = await (await fetch('http://127.0.0.1:9333/json')).json()
  const ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve) => ws.addEventListener('open', resolve))
  let nextId = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const resolve = pending.get(message.id)
    if (typeof resolve !== 'function') return
    pending.delete(message.id)
    resolve(message.result)
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme }],
    })
    for (const layer of LAYERS) {
      await send('Page.navigate', { url: 'about:blank' })
      await send('Page.navigate', { url: `${DEV_URL}#/?layer=${layer}` })
      await sleep(SETTLE_MS)
      // Floating panels and the loading badge would cover the map.
      await send('Runtime.evaluate', {
        expression: `document.head.insertAdjacentHTML('beforeend',
          '<style>.glass,.shadow-float,[role=status],footer{visibility:hidden!important}</style>')`,
      })
      await sleep(500)
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: CLIP })
      const name = `${layer}${scheme === 'dark' ? '-dark' : ''}`
      const png = join(work, `${name}.png`)
      writeFileSync(png, Buffer.from(shot.data, 'base64'))
      execFileSync('cwebp', [
        '-quiet',
        '-q',
        '80',
        '-resize',
        '320',
        '200',
        png,
        '-o',
        join(OUT, `${name}.webp`),
      ])
      console.log(name)
    }
  }
  ws.close()
} finally {
  chrome.kill()
}
