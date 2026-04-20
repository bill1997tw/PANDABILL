import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#11203b",
        mist: "#f5f7fb",
        line: "#d7dfec",
        accent: "#1d8f6a",
        warm: "#f2b56b",
        danger: "#c85757"
      },
      boxShadow: {
        soft: "0 20px 45px -28px rgba(17, 32, 59, 0.35)"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top left, rgba(29,143,106,0.18), transparent 35%), radial-gradient(circle at top right, rgba(242,181,107,0.18), transparent 28%)"
      }
    }
  },
  plugins: []
};

export default config;
