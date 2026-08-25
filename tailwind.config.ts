import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F1E8",
        surface: "#FFFDF8",
        ink: "#17211F",
        teal: "#0E4542",
        "teal-tint": "#DCEBE5",
        saffron: "#D98B28",
        "saffron-tint": "#F7E5C5",
        rule: "#D9D2C6",
        "marreg-pink": "#B8326A",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        ui: ["Manrope", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
