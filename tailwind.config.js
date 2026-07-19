/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Black & white theme.
        // `navy` is the neutral (grayscale) palette. Its ramp is intentionally
        // INVERTED relative to a normal scale: the shades the app uses for dark
        // backgrounds (700-950) now resolve to near-white, and the shades it uses
        // for text (300-500) resolve to readable dark grays. This flips the old
        // dark theme to a light (white bg / black text) theme without rewriting
        // the ~370 existing `navy-*` usages.
        navy: {
          50: '#171717',
          100: '#1f1f1f',
          200: '#2e2e2e',
          300: '#404040', // primary secondary-text (most prominent gray)
          400: '#525252', // muted text / placeholders
          500: '#737373', // subtle text / dividers
          600: '#d4d4d4', // borders, avatar fills
          700: '#e5e5e5', // input & row backgrounds
          800: '#f4f4f5', // card backgrounds
          900: '#fafafa',
          950: '#ffffff', // page background
        },
        // `gold` is the single accent color: emerald green.
        // Tuned for a light theme — the text shade (400) is a deep, readable
        // emerald, while the fill shade (500) is a vivid emerald for buttons.
        gold: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#059669',
          400: '#047857', // accent text on white
          500: '#10b981', // solid accent fills (buttons, borders, rings)
          600: '#059669', // accent hover
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
