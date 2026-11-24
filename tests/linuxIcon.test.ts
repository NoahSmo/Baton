import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { setLinuxDesktopIcon, withIcon } from '../src/main/linuxIcon'

const entry = `[Desktop Entry]
Name=Guru
Exec=/opt/Guru/baton %U
Icon=baton
Type=Application

[Desktop Action New]
Icon=other
`

describe('withIcon', () => {
  it('replaces the main icon only', () => {
    const next = withIcon(entry, '/home/u/.baton/app-icons/classic.png')
    expect(next).toContain('Icon=/home/u/.baton/app-icons/classic.png\nType=Application')
    expect(next).toContain('Icon=other')
  })
})

describe('setLinuxDesktopIcon', () => {
  it('writes a user entry pointing at a copy of the icon, and does nothing without an entry', () => {
    const home = mkdtempSync(join(tmpdir(), 'guru-icon-'))
    const source = join(home, 'source.png')
    writeFileSync(source, 'png')
    const paths = { home, slug: 'guru-test-missing', store: join(home, '.baton', 'app-icons') }
    expect(setLinuxDesktopIcon(source, 'classic', paths)).toBe(false)

    const apps = join(home, '.local', 'share', 'applications')
    mkdirSync(apps, { recursive: true })
    writeFileSync(join(apps, 'guru-test.desktop'), entry)
    const found = { ...paths, slug: 'guru-test' }
    expect(setLinuxDesktopIcon(source, 'classic', found)).toBe(true)
    expect(readFileSync(join(apps, 'guru-test.desktop'), 'utf8')).toContain(`Icon=${join(found.store, 'classic.png')}`)
    expect(readFileSync(join(found.store, 'classic.png'), 'utf8')).toBe('png')
    // Same choice again: nothing to rewrite.
    expect(setLinuxDesktopIcon(source, 'classic', found)).toBe(false)
  })
})
