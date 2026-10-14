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
  }
]

export const DEFAULT_THEME = THEMES[0]

/** The theme stored under `id`, the default one if there is none. */
export function themeById(id: unknown): Theme {
  return THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME
}

/** `accentText` → `--accent-text`. */
export function cssVar(key: string): string {
  return `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}
