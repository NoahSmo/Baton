import { cssVar, themeById, type Theme } from '../../shared/themes'
import { setTerminalTheme } from './terminalStore'

/** Last theme shown, read before the first paint so the stored choice does not arrive as a flash. */
const CACHE_KEY = 'theme'

export function cachedTheme(): Theme {
  return themeById(localStorage.getItem(CACHE_KEY))
}

/** Recolors the whole app: CSS variables, native controls and terminals. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.colors)) root.style.setProperty(cssVar(key), value)
  root.style.colorScheme = theme.dark ? 'dark' : 'light'
  root.dataset.theme = theme.id
  setTerminalTheme(theme)
  localStorage.setItem(CACHE_KEY, theme.id)
}
