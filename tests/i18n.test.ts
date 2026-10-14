import { describe, expect, it } from 'vitest'
import { DICTS, langFromLocale } from '../src/shared/i18n'

/** Every leaf path of a dictionary, e.g. "status.idle". */
function paths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k))
}

describe('dictionaries', () => {
  it('have the same keys in every language', () => {
    expect(paths(DICTS.fr).sort()).toEqual(paths(DICTS.en).sort())
  })

  it('agree in French on singular and plural', () => {
    expect(DICTS.fr.project.gitDetected('main', 1)).toBe('Dépôt git détecté · branche main · 1 fichier modifié')
    expect(DICTS.fr.project.gitDetected(null, 5)).toBe('Dépôt git détecté · 5 fichiers modifiés')
    expect(DICTS.fr.statusbar.done(0)).toBe('0 terminé')
    expect(DICTS.fr.statusbar.done(2)).toBe('2 terminés')
  })
})

describe('langFromLocale', () => {
  it('maps French locales to French and everything else to English', () => {
    expect(langFromLocale('fr-FR')).toBe('fr')
    expect(langFromLocale('fr')).toBe('fr')
    expect(langFromLocale('en-US')).toBe('en')
    expect(langFromLocale('de-DE')).toBe('en')
    expect(langFromLocale(undefined)).toBe('en')
  })
})
