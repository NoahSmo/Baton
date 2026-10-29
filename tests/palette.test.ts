import { describe, expect, it } from 'vitest'
import { filterPalette } from '../src/shared/palette'

const items = [
  { id: 'a', label: 'Fix login bug', keywords: 'feat/auth Acme' },
  { id: 'b', label: 'Login page redesign', keywords: 'feat/ui Acme' },
  { id: 'c', label: 'Écran de réglages', keywords: 'feat/settings Orchestra' }
]

describe('filterPalette', () => {
  it('keeps everything, in order, for an empty query', () => {
    expect(filterPalette(items, '  ')).toEqual(items)
  })

  it('needs every word, ignoring case and accents', () => {
    expect(filterPalette(items, 'ecran REGLAGES').map((i) => i.id)).toEqual(['c'])
    expect(filterPalette(items, 'login zzz')).toEqual([])
  })

  it('ranks a label start before a label hit before a keyword hit', () => {
    expect(filterPalette(items, 'login').map((i) => i.id)).toEqual(['b', 'a'])
    expect(filterPalette(items, 'acme').map((i) => i.id)).toEqual(['a', 'b'])
  })
})
