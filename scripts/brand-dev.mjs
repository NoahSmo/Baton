// Gives the Electron that `npm run dev` launches the app's name and icon:
// macOS reads both from the bundle, which says "Electron" until packaged.
// Runs before each dev session; a reinstall of electron resets the bundle.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, utimesSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = join(root, 'node_modules/electron/dist/Electron.app')
const plist = join(bundle, 'Contents/Info.plist')
const { productName } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).build

if (process.platform === 'darwin' && existsSync(plist)) {
  const read = (key) => execFileSync('plutil', ['-extract', key, 'raw', plist], { encoding: 'utf8' }).trim()
  if (read('CFBundleName') !== productName) {
    for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
      execFileSync('plutil', ['-replace', key, '-string', productName, plist])
    }
    copyFileSync(join(root, 'build/icon.icns'), join(bundle, 'Contents/Resources', read('CFBundleIconFile')))
    // The Dock and Finder cache a bundle's name and icon until its date changes.
    const now = new Date()
    utimesSync(bundle, now, now)
  }
}
