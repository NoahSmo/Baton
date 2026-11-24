/** Colors of a theme, each one a CSS variable of the same name (`faint` is `--faint`, `accentText` is `--accent-text`). */
export interface Palette {
  bg: string
  panel: string
  raised: string
  /** Buttons under the pointer, between `raised` and `border`. */
  hover: string
  border: string
  borderStrong: string
  text: string
  muted: string
  /** Line numbers and idle dots, quieter than `muted`. */
  faint: string
  accent: string
  accentHover: string
  accentText: string
  blue: string
  amber: string
  green: string
  red: string
  redHover: string
  /** Text on a red fill. */
  dangerText: string
  purple: string
  cyan: string
  orange: string
  /** Operators and punctuation in code. */
  punct: string
  /** Comments in code. */
  comment: string
  shadow: string
  overlay: string
}

export interface Theme {
  id: string
  name: string
  dark: boolean
  colors: Palette
}

export const THEMES: Theme[] = [
  {
    id: 'studio',
    name: 'Studio',
    dark: true,
    colors: {
      bg: '#0e0e12',
      panel: '#14141a',
      raised: '#1b1b23',
      hover: '#23232d',
      border: '#25252f',
      borderStrong: '#34343f',
      text: '#ececf1',
      muted: '#9a9aa8',
      faint: '#62626f',
      accent: '#8b7cf6',
      accentHover: '#9d90f8',
      accentText: '#0d0a24',
      blue: '#6aa7f0',
      amber: '#e5a83b',
      green: '#4cc38a',
      red: '#f0787a',
      redHover: '#f48f91',
      dangerText: '#2a0f10',
      purple: '#b49cf2',
      cyan: '#2cc3d1',
      orange: '#e0914f',
      punct: '#c2c2d0',
      comment: '#767684',
      shadow: 'rgba(0, 0, 0, 0.55)',
      overlay: 'rgba(0, 0, 0, 0.6)'
    }
  },
  {
    id: 'baton',
    name: 'Baton',
    dark: true,
    colors: {
      bg: '#1d1a17',
      panel: '#24201c',
      raised: '#2e2823',
      hover: '#372f29',
      border: '#40362d',
      borderStrong: '#5a4838',
      text: '#ece6df',
      muted: '#9a8f84',
      faint: '#6b6158',
      accent: '#e08e62',
      accentHover: '#eb9d74',
      accentText: '#24140b',
      blue: '#62a5ec',
      amber: '#e5a83b',
      green: '#6cbb7a',
      red: '#e6807a',
      redHover: '#ee9590',
      dangerText: '#2a0f0d',
      purple: '#b392e6',
      cyan: '#12b8bf',
      orange: '#d2964a',
      punct: '#c9bcae',
      comment: '#857a6f',
      shadow: 'rgba(0, 0, 0, 0.5)',
      overlay: 'rgba(0, 0, 0, 0.55)'
    }
  },
  {
    id: 'graphite',
    name: 'Graphite',
    dark: true,
    colors: {
      bg: '#18191b',
      panel: '#1f2023',
      raised: '#292a2e',
      hover: '#313237',
      border: '#36373c',
      borderStrong: '#4a4b52',
      text: '#e6e6e9',
      muted: '#8e8f97',
      faint: '#5e5f66',
      accent: '#4fc1a6',
      accentHover: '#6dd0b8',
      accentText: '#062019',
      blue: '#6aa7f0',
      amber: '#e2b14a',
      green: '#7cc47f',
      red: '#ef7f7f',
      redHover: '#f39b9b',
      dangerText: '#2b0b0b',
      purple: '#b39cf0',
      cyan: '#4cc6d6',
      orange: '#e09a5b',
      punct: '#c4c5cb',
      comment: '#74757d',
      shadow: 'rgba(0, 0, 0, 0.55)',
      overlay: 'rgba(0, 0, 0, 0.6)'
    }
  },
  {
    id: 'fjord',
    name: 'Fjord',
    dark: true,
    colors: {
      bg: '#1b2029',
      panel: '#212733',
      raised: '#2a3140',
      hover: '#323a4b',
      border: '#363f50',
      borderStrong: '#4a5568',
      text: '#e3e8ef',
      muted: '#8d98aa',
      faint: '#5f6b7e',
      accent: '#88c0d0',
      accentHover: '#a3d1de',
      accentText: '#0e1d24',
      blue: '#81a1c1',
      amber: '#ebcb8b',
      green: '#a3be8c',
      red: '#e08890',
      redHover: '#eba0a6',
      dangerText: '#2a0e12',
      purple: '#b48ead',
      cyan: '#8fbcbb',
      orange: '#d08770',
      punct: '#c0c8d6',
      comment: '#6f7b8f',
      shadow: 'rgba(5, 10, 20, 0.55)',
      overlay: 'rgba(5, 10, 20, 0.6)'
    }
  },
  {
    id: 'latte',
    name: 'Latte',
    dark: false,
    colors: {
      bg: '#faf7f2',
      panel: '#f3eee6',
      raised: '#e9e2d7',
      hover: '#e2d9cc',
      border: '#ddd4c6',
      borderStrong: '#c9bba8',
      text: '#2b2520',
      muted: '#7a6e62',
      faint: '#b3a798',
      accent: '#c2622d',
      accentHover: '#a9521f',
      accentText: '#fff8f2',
      blue: '#2f6fbf',
      amber: '#a86b00',
      green: '#3d8a4a',
      red: '#c4453b',
      redHover: '#a8362d',
      dangerText: '#fff5f3',
      purple: '#8a55c9',
      cyan: '#0f8a90',
      orange: '#b06a1e',
      punct: '#5c5148',
      comment: '#9a8d80',
      shadow: 'rgba(60, 40, 20, 0.18)',
      overlay: 'rgba(40, 30, 20, 0.3)'
    }
  },
  {
    id: 'snow',
    name: 'Snow',
    dark: false,
    colors: {
      bg: '#ffffff',
      panel: '#f6f7f9',
      raised: '#eceef2',
      hover: '#e3e6ec',
      border: '#dfe2e8',
      borderStrong: '#c7ccd5',
      text: '#1f2328',
      muted: '#656d78',
      faint: '#a8afba',
      accent: '#3a6df0',
      accentHover: '#2b5ad6',
      accentText: '#ffffff',
      blue: '#0b69c7',
      amber: '#9a6700',
      green: '#1a7f37',
      red: '#cf222e',
      redHover: '#a40e26',
      dangerText: '#ffffff',
      purple: '#8250df',
      cyan: '#0a7d8c',
      orange: '#bc4c00',
      punct: '#4b535d',
      comment: '#8b949e',
      shadow: 'rgba(20, 30, 50, 0.16)',
      overlay: 'rgba(20, 30, 50, 0.28)'
    }
  },
  {
    id: 'rosy',
    name: 'Rosy',
    dark: false,
    colors: {
      bg: '#fff9fa',
      panel: '#fbf0f3',
      raised: '#f5e3e9',
      hover: '#efd7df',
      border: '#ecd3db',
      borderStrong: '#dbb4c2',
      text: '#33202a',
      muted: '#80626f',
      faint: '#bb9eab',
      accent: '#d6457f',
      accentHover: '#bd356c',
      accentText: '#fff5f8',
      blue: '#3a6cc2',
      amber: '#a96a05',
      green: '#2f8a58',
      red: '#c8374b',
      redHover: '#a92a3c',
      dangerText: '#fff5f6',
      purple: '#9150c4',
      cyan: '#0f8794',
      orange: '#b8602a',
      punct: '#5a424d',
      comment: '#a28a96',
      shadow: 'rgba(90, 30, 55, 0.16)',
      overlay: 'rgba(60, 20, 40, 0.3)'
    }
  },
  {
    // Rosy by night: the same pink, lit on plum.
    id: 'rosy-dark',
    name: 'Rosy Dark',
    dark: true,
    colors: {
      bg: '#1a1317',
      panel: '#21181d',
      raised: '#2a1f25',
      hover: '#34262e',
      border: '#382931',
      borderStrong: '#523846',
      text: '#f6e7ed',
      muted: '#b996a6',
      faint: '#7a5e6b',
      accent: '#ee5f98',
      accentHover: '#f47dab',
      accentText: '#24101a',
      blue: '#7ea4ef',
      amber: '#e2a84c',
      green: '#5ec48b',
      red: '#f26b7d',
      redHover: '#f68a98',
      dangerText: '#2a0f15',
      purple: '#c38df0',
      cyan: '#4fc3ce',
      orange: '#ea925b',
      punct: '#d8bdc8',
      comment: '#8d7180',
      shadow: 'rgba(0, 0, 0, 0.5)',
      overlay: 'rgba(12, 4, 9, 0.6)'
    }
  },
  {
    // wesur.fr: its blue on a lavender white, navy text.
    id: 'wesur',
    name: 'Wesur',
    dark: false,
    colors: {
      bg: '#f8f8fd',
      panel: '#f1f1fa',
      raised: '#e9e9f8',
      hover: '#dfdff5',
      border: '#e1e1f2',
      borderStrong: '#c3c3ec',
      text: '#1f1d4e',
      muted: '#5d5b8a',
      faint: '#a2a1c6',
      accent: '#4150f7',
      accentHover: '#2f3de2',
      accentText: '#ffffff',
      blue: '#2f6fd6',
      amber: '#b07f06',
      green: '#1f8a5b',
      red: '#d6336c',
      redHover: '#b8275a',
      dangerText: '#fff5f8',
      purple: '#7a4fd6',
      cyan: '#0d86a0',
      orange: '#d9661f',
      punct: '#3d3b6b',
      comment: '#8f8db8',
      shadow: 'rgba(31, 29, 78, 0.14)',
      overlay: 'rgba(31, 29, 78, 0.32)'
    }
  },
  {
    // Brushed aluminium, black print and one orange key. Its layout overrides live in styles.css, under its id.
    id: 'teenage',
    name: 'Teenage Engineering',
    dark: false,
    colors: {
      bg: '#e6e6e1',
      panel: '#efefeb',
      raised: '#f8f8f5',
      hover: '#dadad4',
      border: '#c9c9c2',
      borderStrong: '#1b1b1b',
      text: '#121212',
      muted: '#55554f',
      faint: '#8f8f88',
      accent: '#ff4f00',
      accentHover: '#e84700',
      accentText: '#121212',
      blue: '#1f5bea',
      amber: '#a87300',
      green: '#0a8a50',
      red: '#d81f26',
      redHover: '#b8181e',
      dangerText: '#ffffff',
      purple: '#6a45e0',
      cyan: '#00808f',
      orange: '#c23d00',
      punct: '#2e2e2b',
      comment: '#87877f',
      shadow: 'rgba(0, 0, 0, 0.18)',
      overlay: 'rgba(18, 18, 18, 0.32)'
    }
  },
  {
    // The same unit in black anodised aluminium. Shares the layout overrides of 'teenage' in styles.css.
    id: 'teenage-dark',
    name: 'Teenage Engineering Dark',
    dark: true,
    colors: {
      bg: '#161614',
      panel: '#1d1d1b',
      raised: '#262624',
      hover: '#302f2d',
      border: '#383835',
      borderStrong: '#8d8d85',
      text: '#f0f0ea',
      muted: '#a6a69e',
      faint: '#6f6f68',
      accent: '#ff5a14',
      accentHover: '#ff7338',
      accentText: '#120a05',
      blue: '#6c9bff',
      amber: '#e6b23a',
      green: '#3fd08a',
      red: '#ff5f63',
      redHover: '#ff7b7e',
      dangerText: '#1c0708',
      purple: '#a28bff',
      cyan: '#35c4d4',
      orange: '#ff8a3d',
      punct: '#cfcfc6',
      comment: '#7b7b73',
      shadow: 'rgba(0, 0, 0, 0.6)',
      overlay: 'rgba(0, 0, 0, 0.62)'
    }
  }
]

export const DEFAULT_THEME = THEMES[0]

/** Custom themes carry this prefix in their id, so they never clash with a built-in one. */
export const CUSTOM_PREFIX = 'custom-'

const HEX = /^#[0-9a-f]{6}$/i
const RGBA = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/i

/** Colors that are not opaque, so the editor cannot offer a plain color picker for them. */
export const TRANSLUCENT_KEYS = ['shadow', 'overlay']

/** A stored custom theme, every color checked; `null` when it is not usable. Missing colors come from `base`. */
export function sanitizeTheme(raw: unknown, base: Theme = DEFAULT_THEME): Theme | null {
  if (!raw || typeof raw !== 'object') return null
  const { id, name, dark, colors } = raw as Record<string, unknown>
  if (typeof id !== 'string' || !id.startsWith(CUSTOM_PREFIX) || typeof name !== 'string') return null
  const out: Palette = { ...base.colors }
  for (const key of Object.keys(out) as (keyof Palette)[]) {
    const value = (colors as Record<string, unknown> | undefined)?.[key]
    if (typeof value === 'string' && (HEX.test(value) || (TRANSLUCENT_KEYS.includes(key) && RGBA.test(value)))) out[key] = value
  }
  return { id, name: name.trim().slice(0, 40) || 'Custom', dark: dark === true, colors: out }
}

/** The list as stored, with anything unusable and any duplicate dropped. */
export function sanitizeThemes(raw: unknown): Theme[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Theme[] = []
  for (const item of raw) {
    const theme = sanitizeTheme(item)
    if (theme && !seen.has(theme.id)) {
      seen.add(theme.id)
      out.push(theme)
    }
  }
  return out
}

/** A new custom theme starting from `base`'s colors. */
export function newCustomTheme(base: Theme, name: string): Theme {
  return { id: `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, dark: base.dark, colors: { ...base.colors } }
}

/** The theme stored under `id`, among the built-in ones and `customs`; the default one if there is none. */
export function themeById(id: unknown, customs: Theme[] = []): Theme {
  return THEMES.find((theme) => theme.id === id) ?? customs.find((theme) => theme.id === id) ?? DEFAULT_THEME
}

/** `accentText` → `--accent-text`. */
export function cssVar(key: string): string {
  return `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}
