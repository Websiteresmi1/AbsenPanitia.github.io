/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        pine: {
          50: '#f0f7f4',
          100: '#dceee6',
          200: '#bcdec8',
          300: '#93c7b3',
          400: '#62a88f',
          500: '#418b72',
          600: '#306f5a',
          700: '#275949',
          800: '#1b4332',
          900: '#17382b',
          950: '#0c1f18',
        },
      },
    },
  },
  plugins: [],
};
