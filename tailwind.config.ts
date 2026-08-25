import type { Config } from "tailwindcss";
const config: Config = { content: ["./app/**/*.{ts,tsx}"], theme: { extend: { colors: { paper:"#F6F1E8", surface:"#FFFDF8", ink:"#17211F", teal:"#0E4542", saffron:"#D98B28", rule:"#D9D2C6" }, fontFamily:{display:["Fraunces","Georgia","serif"],ui:["Manrope","sans-serif"]} } }, plugins:[] };
export default config;
