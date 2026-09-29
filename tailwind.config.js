/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0d12",
        panel: "#11141b",
        line: "#222630",
        muted: "#858b9b",
        accent: "#a3e635",
      },
    },
  },
  plugins: [],
};
