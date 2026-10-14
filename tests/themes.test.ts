import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cssVar, DEFAULT_THEME, THEMES, themeById } from '../src/shared/themes'

describe('themes', () => {
  it('names CSS variables after palette keys', () => {
    expect(cssVar('bg')).toBe('--bg')
    expect(cssVar('accentText')).toBe('--accent-text')
    expect(cssVar('borderStrong')).toBe('--border-strong')
  })

  it('falls back to the default theme for an unknown id', () => {
    expect(themeById('snow').id).toBe('snow')
    expect(themeById('gone')).toBe(DEFAULT_THEME)
    expect(themeById(undefined)).toBe(DEFAULT_THEME)
  })

  it('has unique ids', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
  })

  it('keeps the stylesheet defaults equal to the default theme', () => {
    const css = readFileSync(join(__dirname, '../src/renderer/src/styles.css'), 'utf8')
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
    for (const [key, value] of Object.entries(DEFAULT_THEME.colors)) {
      expect(root, key).toContain(`${cssVar(key)}: ${value};`)
    }
  })
})
