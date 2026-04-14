import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand
        wa: {
          green: '#25D366',
          greenDark: '#1EBE5D',
          teal: '#128C7E',
          bubble: '#DCF8C6',
        },
        // Surface
        navy: {
          900: '#0A1628',
          800: '#0D2B4A',
          700: '#13335A',
        },
        ink: {
          900: '#0F172A',
          700: '#1F2937',
          500: '#475569',
          400: '#64748B',
          300: '#94A3B8',
          200: '#CBD5E1',
          100: '#E5E9F0',
          50: '#F6F8FB',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['clamp(2.25rem, 5.5vw, 4rem)', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-lg': ['clamp(1.875rem, 4vw, 2.75rem)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['clamp(1.5rem, 3vw, 2rem)', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '700' }],
      },
      boxShadow: {
        soft: '0 4px 20px -8px rgba(15, 23, 42, 0.08)',
        card: '0 10px 40px -12px rgba(15, 23, 42, 0.12)',
        glow: '0 0 80px -10px rgba(37, 211, 102, 0.45)',
        phone: '0 40px 80px -20px rgba(10, 22, 40, 0.5), 0 0 0 12px #0A1628, 0 0 0 14px #1F2937',
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite',
        'fade-up': 'fade-up 0.6s ease-out both',
        'typing': 'typing 1.2s steps(3, end) infinite',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '80%, 100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'typing': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
      },
      backgroundImage: {
        'hero-radial': 'radial-gradient(circle at 75% 35%, rgba(37, 211, 102, 0.18), transparent 55%)',
      },
    },
  },
  plugins: [],
};

export default config;
