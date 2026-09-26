// Instagram-faithful light + dark palettes with a render-safe accessor for
// module-level components (which can't take the in-component `C` object).
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
};

export const DarkTheme: Theme = {
  bg: '#000000',
  text: '#F5F5F5',
  muted: '#A8A8A8',
  hairline: '#363636',
  fill: '#262626',
  sheet: '#262626',
  inputBg: '#000000',
  accent: '#0095F6',
  like: '#FF3040',
  green: '#34C759',
  link: '#E0F1FF',
};

export type ThemeMode = 'light' | 'dark';

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
