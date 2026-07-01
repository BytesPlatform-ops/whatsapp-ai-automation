'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type PlTheme = 'light' | 'dark';

/** The blocking script string injected in the Lab layout <head>. Runs BEFORE
 *  React hydration so `html[data-pl-theme]` is correct on first paint — no
 *  flash. Default is LIGHT (soft mint). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('pixie-theme');if(t!=='light'&&t!=='dark')t='light';document.documentElement.setAttribute('data-pl-theme',t);}catch(e){document.documentElement.setAttribute('data-pl-theme','light');}})();`;

interface ThemeCtx {
  theme: PlTheme;
  setTheme: (t: PlTheme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {}, toggle: () => {} });

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read whatever the pre-hydration script already put on <html> so SSR/client agree.
  const [theme, setThemeState] = useState<PlTheme>('light');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-pl-theme');
    if (current === 'dark' || current === 'light') setThemeState(current);
  }, []);

  const setTheme = useCallback((t: PlTheme) => {
    setThemeState(t);
    try { localStorage.setItem('pixie-theme', t); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-pl-theme', t);
  }, []);

  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}
