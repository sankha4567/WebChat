import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          500: "#25D366",
          600: "#128C7E",
          700: "#075E54",
        },
        chat: {
          bg: "#0b141a",
          sidebar: "#111b21",
          header: "#202c33",
          input: "#2a3942",
          bubble: {
            outgoing: "#005c4b",
            incoming: "#202c33",
          },
          hover: "#2a3942",
          border: "#222d34",
          text: {
            primary: "#e9edef",
            secondary: "#8696a0",
            muted: "#667781",
          },
        },
      },
      animation: {
        "scale-in": "scale-in 0.2s ease-out",
      },
      keyframes: {
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;