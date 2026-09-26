// Circles design system — Instagram-faithful light + dark palettes with a
// render-safe accessor for module-level components (which can't take the
// in-component `C` object).
// Aesthetic: brand-first hierarchy, two typefaces max (GrandHotel display +
// system body), one accent (#0095F6). Restrained motion, no gradients.
export type Theme = {
  bg: string;
  text: string;
  muted: string;
  hairline: string;
  fill: string;
  sheet: string;
  inputBg: string;
  accent: string;
  like: string;
  green: string;
  link: string;
  tabBar: string;
  scrim: string;
};

export const LightTheme: Theme = {
  bg: '#FFFFFF',
  text: '#000000',
  muted: '#737373',
  hairline: '#DBDBDB',
  fill: '#EFEFEF',
  sheet: '#FFFFFF',
  inputBg: '#FFFFFF',
  accent: '#0095F6',
  like: '#FF3040',
  green: '#34C759',
  link: '#00376B',
  tabBar: 'rgba(255,255,255,0.82)',
  scrim: 'rgba(0,0,0,0.45)',
};

export const DarkTheme: Theme = {
  bg: '#000000',
  text: '#F5F5F5',
  muted: '#A8A8A8',
  hairline: '#363636',
  fill: '#262626',
  sheet: '#1C1C1E',
  inputBg: '#000000',
  accent: '#0095F6',
  like: '#FF3040',
  green: '#34C759',
  link: '#E0F1FF',
  tabBar: 'rgba(28,28,30,0.82)',
  scrim: 'rgba(0,0,0,0.55)',
};

export type ThemeMode = 'light' | 'dark';

// Durable spacing / radius tokens — use these instead of magic numbers.
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 20,
  round: 999,
} as const;

export const Accent = '#0095F6';

// Mutable render-safe reference: App sets it every render (idempotent), and
// module-level presentational components read `.colors` without prop drilling.
export const ThemeRef: { mode: ThemeMode; colors: Theme } = {
  mode: 'light',
  colors: LightTheme,
};

export function applyTheme(mode: ThemeMode): Theme {
  ThemeRef.mode = mode;
  ThemeRef.colors = mode === 'dark' ? DarkTheme : LightTheme;
  return ThemeRef.colors;
}
