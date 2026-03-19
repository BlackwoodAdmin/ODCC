/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#FFF8E7',
          50: '#FFFEF9',
          100: '#FEFCF0',
          200: '#FFF8E7',
          300: '#FFEFCC',
          400: '#FFE5A0',
          500: '#FFDB73',
          600: '#D4AF37',
        },
        sage: {
          DEFAULT: '#5BA346',
          50: '#F8FAF6',
          100: '#E8F1E4',
          200: '#D1E3C8',
          300: '#B9D5AD',
          400: '#7FBF6F',
          500: '#5BA346',
          600: '#4A8C38',
          700: '#3A6B2C',
          light: '#B9D5AD',
        },
        earth: {
          DEFAULT: '#6F5646',
          100: '#F5E6D3',
          200: '#E0BFA8',
          300: '#CAAA8C',
          400: '#9B7563',
          500: '#6F5646',
        },
        charcoal: '#2C2C2C',
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
