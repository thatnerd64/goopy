import { alpha, createTheme } from "@mui/material";

// Brand colors shared with components that need a raw value
export const customColors = {
  gold: "#d9a441",
  alert: "#f59e7c",
  // Accent gradient used by the logo, the active tab and primary actions
  gradient: "linear-gradient(135deg, #3dd9c3 0%, #38bdf8 55%, #a78bfa 100%)",
  gradientSoft:
    "linear-gradient(135deg, rgba(61,217,195,.16) 0%, rgba(56,189,248,.12) 55%, rgba(167,139,250,.16) 100%)",
};

const palette = {
  background: "#0a0c10",
  surface: "#10131a",
  raised: "#151a23",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
};

export const surface = palette;

const fontFamily = [
  '"Inter"',
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  "Roboto",
  '"Helvetica Neue"',
  "Arial",
  "sans-serif",
].join(",");

export const darkTheme = createTheme({
  cssVariables: false,
  palette: {
    mode: "dark",
    primary: {
      main: "#3dd9c3",
      light: "#86f0e0",
      dark: "#1fb09d",
      contrastText: "#03201b",
    },
    secondary: {
      main: "#a78bfa",
      light: "#c4b5fd",
      dark: "#7c5ce0",
      contrastText: "#140a30",
    },
    success: { main: "#4ade80", contrastText: "#052e16" },
    warning: { main: "#fbbf24", contrastText: "#2a1d00" },
    error: { main: "#f87171", contrastText: "#2d0707" },
    info: { main: "#60a5fa", contrastText: "#06203f" },
    background: { default: palette.background, paper: palette.surface },
    text: {
      primary: "#eef1f6",
      secondary: "#9aa3b2",
      disabled: "#5f6877",
    },
    divider: palette.border,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily,
    fontSize: 14,
    h1: {
      fontSize: 32,
      fontWeight: 800,
      letterSpacing: "-0.02em",
      lineHeight: 1.15,
    },
    h2: {
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: "-0.015em",
      lineHeight: 1.25,
    },
    h3: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: "none", letterSpacing: 0 },
    overline: { fontWeight: 700, letterSpacing: "0.08em" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { scrollPaddingTop: "9rem", colorScheme: "dark" },
        body: {
          backgroundColor: palette.background,
          backgroundImage:
            "radial-gradient(1200px 500px at 12% -10%, rgba(61,217,195,.08), transparent 60%), radial-gradient(900px 480px at 100% 0%, rgba(167,139,250,.08), transparent 55%)",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
          fontVariantNumeric: "tabular-nums",
        },
        "::selection": { background: alpha("#3dd9c3", 0.35) },
        "*": {
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,.18) transparent",
        },
        "*::-webkit-scrollbar": { width: 10, height: 10 },
        "*::-webkit-scrollbar-thumb": {
          background: "rgba(255,255,255,.14)",
          borderRadius: 8,
          border: "2px solid transparent",
          backgroundClip: "content-box",
        },
        "a:focus-visible, button:focus-visible, [role='button']:focus-visible, input:focus-visible":
          {
            outline: "2px solid #3dd9c3",
            outlineOffset: 2,
          },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            transitionDuration: "0.01ms !important",
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "transparent" },
      styleOverrides: {
        root: {
          backgroundColor: "rgba(10, 12, 16, 0.78)",
          backdropFilter: "saturate(160%) blur(18px)",
          WebkitBackdropFilter: "saturate(160%) blur(18px)",
          borderBottom: `1px solid ${palette.border}`,
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 600,
          transition:
            "background-color .18s ease, border-color .18s ease, transform .12s ease, box-shadow .18s ease",
          "&:active": { transform: "translateY(1px)" },
        },
        outlined: {
          borderColor: palette.borderStrong,
          "&:hover": { borderColor: "currentColor" },
        },
        sizeSmall: { padding: "4px 12px", fontSize: 13 },
      },
      variants: [
        {
          props: { variant: "outlined", color: "primary" },
          style: {
            color: "#86f0e0",
            backgroundColor: alpha("#3dd9c3", 0.06),
            "&:hover": { backgroundColor: alpha("#3dd9c3", 0.14) },
          },
        },
        {
          props: { variant: "contained", color: "primary" },
          style: {
            backgroundImage: customColors.gradient,
            boxShadow: "0 6px 20px -8px rgba(61,217,195,.55)",
            "&:hover": { filter: "brightness(1.08)" },
          },
        },
      ],
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "background-color .18s ease, color .18s ease",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 12,
          height: 24,
        },
        outlined: { borderColor: palette.borderStrong },
        sizeSmall: { height: 22 },
      },
      variants: [
        {
          props: { variant: "filled", color: "default" },
          style: {
            backgroundColor: "rgba(255,255,255,.09)",
            color: "#d5dae3",
          },
        },
      ],
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: palette.raised,
          backgroundImage: "none",
          border: `1px solid ${palette.border}`,
          borderRadius: 16,
          overflow: "hidden",
          transition:
            "transform .2s ease, border-color .2s ease, box-shadow .2s ease",
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 48 },
        indicator: {
          height: 3,
          borderRadius: "3px 3px 0 0",
          backgroundImage: customColors.gradient,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 48,
          fontWeight: 600,
          fontSize: 14,
          color: "#9aa3b2",
          "&.Mui-selected": { color: "#eef1f6" },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(255,255,255,.04)",
          border: `1px solid ${palette.border}`,
          borderRadius: 12,
          padding: 3,
          gap: 2,
        },
        grouped: {
          border: 0,
          borderRadius: "9px !important",
          "&:not(:first-of-type)": { marginLeft: 0, borderRadius: 9 },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          color: "#9aa3b2",
          fontWeight: 600,
          textTransform: "none",
          "&.Mui-selected": {
            color: "#03201b",
            backgroundImage: customColors.gradient,
            "&:hover": { filter: "brightness(1.08)" },
          },
        },
      },
    },
    MuiFilledInput: {
      defaultProps: { disableUnderline: true },
      styleOverrides: {
        root: {
          borderRadius: 14,
          backgroundColor: "rgba(255,255,255,.05)",
          border: "1px solid transparent",
          transition: "background-color .18s ease, border-color .18s ease",
          "&:hover": { backgroundColor: "rgba(255,255,255,.08)" },
          "&.Mui-focused": {
            backgroundColor: "rgba(255,255,255,.07)",
            borderColor: alpha("#3dd9c3", 0.7),
            boxShadow: `0 0 0 3px ${alpha("#3dd9c3", 0.16)}`,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,.03)",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.surface,
          backgroundImage: "none",
          border: `1px solid ${palette.borderStrong}`,
          borderRadius: 20,
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#1d2330",
          border: `1px solid ${palette.borderStrong}`,
          color: "#eef1f6",
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 8,
        },
        arrow: { color: "#1d2330" },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: palette.raised,
          border: `1px solid ${palette.border}`,
          borderRadius: 16,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${palette.border}` },
        head: {
          color: "#9aa3b2",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          backgroundColor: "rgba(255,255,255,.02)",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:last-child td": { borderBottom: 0 },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          height: 6,
          backgroundColor: "rgba(255,255,255,.08)",
        },
        bar: { borderRadius: 999 },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: "0 12px 32px -10px rgba(0,0,0,.7)",
        },
      },
    },
    MuiSkeleton: {
      defaultProps: { animation: "wave" },
      styleOverrides: {
        root: { backgroundColor: "rgba(255,255,255,.06)", borderRadius: 16 },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 12 } },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: palette.border } },
    },
    MuiLink: {
      defaultProps: { underline: "hover" },
    },
  },
});
