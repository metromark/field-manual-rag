import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Per-corpus accent, set at runtime as "--accent-rgb: r g b" by components/Chat.tsx
      colors: { accent: 'rgb(var(--accent-rgb) / <alpha-value>)' },
    },
  },
  plugins: [],
};

export default config;
