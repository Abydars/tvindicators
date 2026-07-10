/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0b0f19',      // Sleek extra dark mode
        panelBg: '#131c2e',     // Slate panel background
        borderBg: '#222f47',    // Premium custom borders
        accentLong: '#00ffbb',   // Bullish CISD / Aqua accent
        accentShort: '#ff1100',  // Bearish CISD / Red accent
        accentSweep: '#00ffff',  // Sweep Color Aqua
      }
    },
  },
  plugins: [],
}
