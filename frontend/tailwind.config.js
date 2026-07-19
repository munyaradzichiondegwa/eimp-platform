/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#C8102E',
          'red-dark': '#A00D24',
          'red-light': '#E8192E',
          gold: '#C9A84C',
          'gold-light': '#DFC06A',
          black: '#1A1A1A',
        },
        sidebar: {
          bg: '#1A1A1A',
          hover: '#2A2A2A',
          active: '#C8102E',
          text: '#CCCCCC',
          'text-active': '#FFFFFF',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto',
          'Helvetica Neue', 'Arial', 'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06)',
        'card-hover': '0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.06)',
      },
    },
  },
  plugins: [],
};
