import { describe, expect, it } from 'vitest'
import { resolveShortcut, shortcutLabel, type KeyLike } from '../src/shared/shortcuts'

const key = (patch: Partial<KeyLike>): KeyLike => ({
  key: '',
  code: '',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...patch
})

describe('resolveShortcut', () => {
  it('uses ⌘ on a Mac and Ctrl elsewhere', () => {
    expect(resolveShortcut(key({ key: 'n', metaKey: true }), true)).toBe('newFeature')
    expect(resolveShortcut(key({ key: 'n', ctrlKey: true }), true)).toBeNull()
    expect(resolveShortcut(key({ key: 'n', ctrlKey: true }), false)).toBe('newFeature')
    expect(resolveShortcut(key({ key: 'n', metaKey: true }), false)).toBeNull()
  })

  it('reads digits and brackets from the physical key, whatever the layout', () => {
    expect(resolveShortcut(key({ key: '&', code: 'Digit1', metaKey: true }), true)).toBe('project:1')
    expect(resolveShortcut(key({ key: '(', code: 'Digit9', metaKey: true }), true)).toBe('project:9')
    expect(resolveShortcut(key({ key: '[', code: 'BracketLeft', metaKey: true }), true)).toBe('prevFeature')
    expect(resolveShortcut(key({ key: ']', code: 'BracketRight', metaKey: true }), true)).toBe('nextFeature')
  })

  it('maps the other actions', () => {
    const meta = { metaKey: true }
    expect(resolveShortcut(key({ key: 'Enter', code: 'Enter', ...meta }), true)).toBe('approve')
    expect(resolveShortcut(key({ key: 'j', ...meta }), true)).toBe('nextWaiting')
    expect(resolveShortcut(key({ key: 'e', ...meta }), true)).toBe('toggleEditor')
    expect(resolveShortcut(key({ key: 'f', ...meta }), true)).toBe('searchConversation')
    expect(resolveShortcut(key({ key: 'k', ...meta }), true)).toBe('palette')
    expect(resolveShortcut(key({ key: 'F', shiftKey: true, ...meta }), true)).toBe('searchSidebar')
  })

  it('leaves alone anything with Alt, a bare key or an unknown combo', () => {
    expect(resolveShortcut(key({ key: 'n', metaKey: true, altKey: true }), true)).toBeNull()
    expect(resolveShortcut(key({ key: 'n' }), true)).toBeNull()
    expect(resolveShortcut(key({ key: 'x', metaKey: true }), true)).toBeNull()
  })
})

describe('shortcutLabel', () => {
  it('writes the combo for the platform', () => {
    expect(shortcutLabel('newFeature', true)).toBe('⌘N')
    expect(shortcutLabel('searchSidebar', false)).toBe('Ctrl+Shift+F')
    expect(shortcutLabel('approve', false)).toBe('Ctrl+Enter')
    expect(shortcutLabel('project:3', true)).toBe('⌘1…9')
  })
})
