import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        layer: "var(--layer)",
        raised: "var(--raised)",
        text: "var(--text)",
        secondary: "var(--secondary)",
        subdued: "var(--subdued)",
        accent: "var(--accent)",
        border: "var(--border)",
      },
      borderRadius: {
        control: "var(--radius-control)",
        card: "var(--radius-card)",
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        6: "var(--space-6)",
        8: "var(--space-8)",
      },
    },
  },
  plugins: [],
};

export default config;
