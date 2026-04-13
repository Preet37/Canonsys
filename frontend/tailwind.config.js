/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        canvas: '#0d1117',
        surface: '#161b22',
        card: '#21262d',
        border: '#30363d',
        muted: '#484f58',
        subtle: '#8b949e',
        primary: '#e6edf3',
        accent: '#58a6ff',
        success: '#3fb950',
        warn: '#d29922',
        danger: '#f85149',
        orange: '#f0883e',
      },
    },
  },
  plugins: [],
}
