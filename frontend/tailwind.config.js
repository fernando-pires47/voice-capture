/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        panel: "0 18px 48px -28px rgba(17, 24, 39, 0.35)",
      },
    },
  },
  plugins: [],
};
