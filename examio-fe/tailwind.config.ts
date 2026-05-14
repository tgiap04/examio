module.exports = {
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        "surface-soft": "var(--surface-soft)",
        "surface-card": "var(--surface-card)",
        "surface-cream-strong": "var(--surface-cream-strong)",
        "surface-dark": "var(--surface-dark)",
        "surface-dark-elevated": "var(--surface-dark-elevated)",
        "surface-dark-soft": "var(--surface-dark-soft)",
        hairline: "var(--hairline)",
        coral: "var(--coral)",
        "coral-active": "var(--coral-active)",
        "accent-teal": "var(--accent-teal)",
        "accent-amber": "var(--accent-amber)",
        ink: "var(--ink)",
        body: "var(--body)",
        "on-dark": "var(--on-dark)",
        "on-dark-soft": "var(--on-dark-soft)",
        gradient: {
          from: "var(--gradient-from)",
          via: "var(--gradient-via)",
          to: "var(--gradient-to)",
        },
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
        mono: "var(--font-mono)",
      },
      borderRadius: {
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "9999px",
      },
      keyframes: {
        shine: {
          "0%": { "background-position": "100%" },
          "100%": { "background-position": "-100%" },
        },
        glow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        shine: "shine 5s linear infinite",
        glow: "glow 2s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass: "0 1px 3px rgba(20, 20, 19, 0.08)",
        "glass-lg": "0 8px 24px rgba(20, 20, 19, 0.1)",
        glow: "0 0 20px rgba(204, 120, 92, 0.22)",
        "glow-lg": "0 0 40px rgba(204, 120, 92, 0.24)",
      },
    },
  },
  plugins: [],
};
