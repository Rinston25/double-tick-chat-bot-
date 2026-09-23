import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'media',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#C8102E',
          dark: '#9E0B23',
          light: '#E33F58',
        },
      },
    },
  },
  plugins: [],
};

export default config;
