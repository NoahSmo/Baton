// Renders the app icons. The default one, build/guru-32, goes to build/icon.png,
// build/icon.icns and build/icons/ (Linux); the others Settings can switch to
// get build/<name>/icon.png (macOS Dock) and build/<name>/512x512.png (Linux window).
// Run with: npm run icon   (macOS only: uses sips and iconutil)
import { app, BrowserWindow } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const build = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const SIZE = 1024
/** macOS icon grid: an 824px rounded square centred on the 1024px canvas. */
const TILE = 824
const RADIUS = 186

/** The artwork's own corners (black or white) fall outside the rounded square: shaving a little more keeps their edge out. */
const INSET = '1%'

/**
 * A PNG artwork is full bleed: it is cut to the rounded square.
 * An SVG already draws the square and its margin.
 */
function page(source) {
  if (source.endsWith('.svg')) {
    const svg = readFileSync(join(build, source), 'utf8')
    return `<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${SIZE}" height="${SIZE}" style="display:block" `)}</body>`
  }
  const margin = (SIZE - TILE) / 2
  return `<body style="margin:0;background:transparent">
    <div style="position:absolute;left:${margin}px;top:${margin}px;width:${TILE}px;height:${TILE}px;border-radius:${RADIUS}px;overflow:hidden">
      <img src="${pathToFileURL(join(build, source))}" style="display:block;width:calc(100% + 2 * ${INSET});height:calc(100% + 2 * ${INSET});margin:calc(-1 * ${INSET})">
    </div>
  </body>`
}

/** Alternatives Settings offers, next to the default. */
const ALTERNATIVES = [
  ['guru-16', 'guru-16/source.png'],
  ['guru-8', 'guru-8/source.png'],
  ['classic', 'classic/icon.svg']
]

app.dock?.hide()

// In an ES module entry point, Electron holds back `ready` until top-level
// awaits settle, so the work has to hang off the promise instead.
void app.whenReady().then(async () => {

  // Never leave a headless Electron running if rendering stalls.
  setTimeout(() => {
    console.error('make-icon: rendering timed out')
    app.exit(1)
  }, 60_000)

  const scratch = mkdtempSync(join(tmpdir(), 'make-icon-'))

  /** Draws a source of the build folder into a PNG, in a window of its own so no earlier frame slips in.
   *  Windows stay open until the end: closing the last one would quit the app. */
  async function render(source, pngFile) {
    const win = new BrowserWindow({
      width: SIZE,
      height: SIZE,
      show: false,
      transparent: true,
      frame: false,
      webPreferences: { offscreen: true }
    })
    // Offscreen windows hand over frames through paint events.
    const frame = new Promise((resolve) => {
      win.webContents.on('paint', (_event, _dirty, image) => {
        if (!image.isEmpty()) resolve(image)
      })
    })
    // A file, not a data URL: the page loads the artwork from disk.
    const html = join(scratch, 'page.html')
    writeFileSync(html, page(source))
    await win.loadFile(html)
    win.webContents.invalidate()
    const image = (await frame).resize({ width: SIZE, height: SIZE, quality: 'best' })
    writeFileSync(join(build, pngFile), image.toPNG())
  }

  /** Linux themes (Mint's Cinnamon among them) draw icons edge to edge, so the macOS margin around the squircle is cropped out. */
  function linuxSizes(pngFile, dir, sizes) {
    const crop = join(scratch, 'icon-linux.png')
    execFileSync('sips', ['-c', String(TILE), String(TILE), join(build, pngFile), '--out', crop], { stdio: 'ignore' })
    for (const size of sizes) {
      execFileSync('sips', ['-z', String(size), String(size), crop, '--out', join(dir, `${size}x${size}.png`)], { stdio: 'ignore' })
    }
  }

  await render('guru-32/source.png', 'icon.png')

  const iconset = join(scratch, 'icon.iconset')
  mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
      execFileSync('sips', ['-z', String(size * scale), String(size * scale), join(build, 'icon.png'), '--out', join(iconset, name)], { stdio: 'ignore' })
    }
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(build, 'icon.icns')])

  const icons = join(build, 'icons')
  rmSync(icons, { recursive: true, force: true })
  mkdirSync(icons)
  linuxSizes('icon.png', icons, [16, 24, 32, 48, 64, 128, 256, 512])

  // The alternatives are only shown at runtime: the Dock's on macOS, the window's on Linux.
  for (const [name, source] of ALTERNATIVES) {
    await render(source, `${name}/icon.png`)
    linuxSizes(`${name}/icon.png`, join(build, name), [512])
  }
  rmSync(scratch, { recursive: true, force: true })
  app.exit(0)
})
