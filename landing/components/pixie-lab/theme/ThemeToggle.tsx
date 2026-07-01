'use client';

import { Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from './ThemeProvider';

/** Sun/moon theme toggle for the Lab topbar. Defaults to light; persists via
 *  ThemeProvider (localStorage). */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)] hover:border-[var(--pl-border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pl-green)] ${className}`}
    >
      <motion.span key={theme} initial={{ rotate: -35, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
        {isDark ? <Moon size={16} /> : <Sun size={16} />}
      </motion.span>
    </button>
  );
}
