// Renders build/icon.svg into build/icon.png, build/icon.icns and build/icons/ (Linux).
// Run with: npm run icon   (macOS only: uses sips and iconutil)
import { app, BrowserWindow } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const build = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const SIZE = 1024

app.dock?.hide()

// In an ES module entry point, Electron holds back `ready` until top-level
// awaits settle, so the work has to hang off the promise instead.
void app.whenReady().then(async () => {

  // Never leave a headless Electron running if rendering stalls.
  setTimeout(() => {
    console.error('make-icon: rendering timed out')
    app.exit(1)
  }, 30_000)

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true }
  })
  const svg = readFileSync(join(build, 'icon.svg'), 'utf8')
  const page = `<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${SIZE}" height="${SIZE}" style="display:block" `)}</body>`

  // Offscreen windows hand over frames through paint events.
  const frame = new Promise((resolve) => {
    win.webContents.on('paint', (_event, _dirty, image) => {
      if (!image.isEmpty()) resolve(image)
    })
  })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
  win.webContents.invalidate()
  const image = (await frame).resize({ width: SIZE, height: SIZE })
  writeFileSync(join(build, 'icon.png'), image.toPNG())

  const iconset = join(build, 'icon.iconset')
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset)
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
      execFileSync('sips', ['-z', String(size * scale), String(size * scale), join(build, 'icon.png'), '--out', join(iconset, name)], { stdio: 'ignore' })
    }
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(build, 'icon.icns')])
  rmSync(iconset, { recursive: true, force: true })

  // Linux themes (Mint's Cinnamon among them) draw icons edge to edge, so the
  // macOS margin around the squircle is cropped out.
  const icons = join(build, 'icons')
  const crop = join(build, 'icon-linux.png')
  rmSync(icons, { recursive: true, force: true })
  mkdirSync(icons)
  execFileSync('sips', ['-c', '824', '824', join(build, 'icon.png'), '--out', crop], { stdio: 'ignore' })
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(size), String(size), crop, '--out', join(icons, `${size}x${size}.png`)], { stdio: 'ignore' })
  }
  rmSync(crop)
  app.exit(0)
})
