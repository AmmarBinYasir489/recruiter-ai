import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd3ff",
          300: "#8eb6ff",
          400: "#598dff",
          500: "#3366ff",
          600: "#1f47e6",
          700: "#1837b4",
          800: "#1a3093",
          900: "#1b2f75",
        },
        ink: {
          900: "#0b1020",
          800: "#131a2e",
          700: "#1c2540",
          600: "#2a3457",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.08)",
        cardhover: "0 2px 4px rgba(16,24,40,.08), 0 16px 40px rgba(16,24,40,.14)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
    },
  },
  plugins: [],
};

export default config;
