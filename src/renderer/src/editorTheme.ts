import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const theme = EditorView.theme(
  {
    '&': { height: '100%', color: 'var(--text)', backgroundColor: 'var(--bg)', fontSize: '12px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
    '.cm-content': { caretColor: 'var(--accent)', padding: '8px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)' },
    '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--faint)', border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--raised) 55%, transparent)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--raised)', border: 'none', color: 'var(--muted)' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
      outline: 'none'
    },
    '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--amber) 30%, transparent)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--amber) 60%, transparent)' },
    '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--blue) 22%, transparent)' },
    '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
    '.cm-panel.cm-search': { padding: '6px 8px' },
    '.cm-panel.cm-search label': { fontSize: '12px', color: 'var(--muted)' },
    '.cm-textfield': { backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px' },
    '.cm-button': {
      backgroundImage: 'none',
      backgroundColor: 'var(--raised)',
      border: '1px solid var(--border)',
      borderRadius: '6px'
    },
    '.cm-tooltip': { backgroundColor: 'var(--raised)', border: '1px solid var(--border-strong)', borderRadius: '6px' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)',
      color: 'var(--text)'
    }
  },
  { dark: true }
)

const highlight = HighlightStyle.define([
  { tag: [tags.comment, tags.meta], color: 'var(--comment)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword], color: 'var(--purple)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--green)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--amber)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--blue)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--cyan)' },
  { tag: [tags.tagName, tags.heading], color: 'var(--accent)' },
  { tag: [tags.attributeName, tags.propertyName], color: 'var(--orange)' },
  { tag: [tags.definition(tags.variableName), tags.variableName], color: 'var(--text)' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--punct)' },
  { tag: tags.link, color: 'var(--blue)', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.invalid, color: 'var(--red)' }
])

/** Editor colors drawn from the app's palette, so they follow the theme. */
export const editorTheme = [theme, syntaxHighlighting(highlight)]
