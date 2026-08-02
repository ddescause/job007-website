/** Tailwind config — mirrors the theme that was previously inline with the CDN build. */
module.exports = {
  content: ['./index.html', './privacy.html', './terms.html'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0f172a', 800: '#1e293b', 700: '#334155', 600: '#475569' },
        gold: { 400: '#d4a853', 500: '#c8973f', 600: '#b8860b' },
        agent: { green: '#22c55e', blue: '#3b82f6', red: '#ef4444', cyan: '#06b6d4' }
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      }
    }
  },
  plugins: [],
}
