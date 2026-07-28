/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      // Matches Rythubidda-UI palette (Rythubidda-UI/tailwind.config.js)
      // — same caramel + cream so the admin feels like part of the same
      // brand family. If Rythubidda-UI updates its palette, mirror the
      // change here to keep them in lockstep.
      colors: {
        primary: {
          DEFAULT: '#AE6F4C',
          50: '#F7EEE8',
          100: '#EFDDD1',
          200: '#DFBBA3',
          300: '#C8794B',
          400: '#B87447',
          500: '#AE6F4C',
          600: '#AB6639',
          700: '#8B532E',
          800: '#6A3F22',
          900: '#4A2C17',
        },
        secondary: {
          DEFAULT: '#E1CAB3',
          50: '#FAF7F3',
          100: '#F5EFE7',
          200: '#EBE0CF',
          300: '#E1CAB3',
          400: '#D7B997',
          500: '#E1CAB3',
          600: '#C9A887',
          700: '#A88562',
          800: '#7A5F46',
          900: '#4D3C2C',
        },
        accent: {
          DEFAULT: '#AB6639',
          light: '#C8794B',
          dark: '#8B532E',
        },
        // Semantic tones for admin status pills so we never hard-code
        // hex values in components.
        success: '#2A9D8F',
        'success-soft': '#DCF5EC',
        danger: '#E63946',
        'danger-soft': '#FCE4E6',
        warning: '#E6A23C',
        'warning-soft': '#FFF4DE',
        info: '#2563EB',
        'info-soft': '#DBEAFE',
      },
    },
  },
  plugins: [],
};
