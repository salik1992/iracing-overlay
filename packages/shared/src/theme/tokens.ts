/**
 * Tokyo Night Night roles for SVG and canvas.
 * Hex values match tokens.css. Widgets read these names and do not declare colors.
 */
export const theme = {
  bg: "#1a1b26",
  fg: "#c0caf5",
  muted: "#565f89",
  dim: "#737aa2",
  border: "#414868",
  rule: "#3b4261",
  accent: "#7aa2f7",
  good: "#9ece6a",
  bad: "#f7768e",
  caution: "#e0af68",
  info: "#7dcfff",
  number: "#ff9e64",
  panelAlpha: 0.88,
  idleOpacity: 0,
  fontFamily: '"Fira Code", monospace',
  fontSizePx: 14,
  lineHeight: 1.25,
  fontWeight: 400,
  fontWeightStrong: 600,
} as const;

export type ThemeColor =
  | "bg"
  | "fg"
  | "muted"
  | "dim"
  | "border"
  | "rule"
  | "accent"
  | "good"
  | "bad"
  | "caution"
  | "info"
  | "number";
