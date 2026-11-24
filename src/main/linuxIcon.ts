import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Points the desktop entry's main `Icon=` line at another file; the other sections (actions) keep theirs. */
export function withIcon(entry: string, icon: string): string {
  let main = false
  return entry
    .split('\n')
    .map((line) => {
      if (line.startsWith('[')) main = line.trim() === '[Desktop Entry]'
      return main && line.startsWith('Icon=') ? `Icon=${icon}` : line
    })
    .join('\n')
}

export interface LinuxIconPaths {
  home: string
  /** Desktop entry name, without `.desktop`. */
  slug: string
  /** Where the copies of the icons live: a folder updates do not wipe. */
  store: string
}

/**
 * Docks and menus on Linux draw the icon of the app's desktop entry, not the
 * window's. A user entry overrides the system one (deb, rpm) of the same name,
 * and install.sh writes its entry there in the first place, so the user entry
 * is written, pointing at a copy of the icon. Each icon gets its own file name:
 * shells cache icons by path.
 * Returns whether the entry changed; false when there is no entry to start from (development, AppImage).
 */
export function setLinuxDesktopIcon(source: string, name: string, paths: LinuxIconPaths): boolean {
  const userEntry = join(paths.home, '.local', 'share', 'applications', `${paths.slug}.desktop`)
  const base = [userEntry, `/usr/share/applications/${paths.slug}.desktop`].find((file) => existsSync(file))
  if (!base) return false
  mkdirSync(paths.store, { recursive: true })
  const icon = join(paths.store, `${name}.png`)
  copyFileSync(source, icon)
  const current = readFileSync(base, 'utf8')
  const next = withIcon(current, icon)
  if (base === userEntry && next === current) return false
  mkdirSync(join(paths.home, '.local', 'share', 'applications'), { recursive: true })
  writeFileSync(userEntry, next)
  return true
}
