/**
 * Signal colors for the lamps. A yellow flag has to read as yellow, so these
 * stay off the Tokyo Night theme tokens.
 */
export const LED = {
  green: "#3DDC6A",
  yellow: "#FFE14A",
  blue: "#3D7BFF",
  white: "#F4F4F4",
  red: "#FF3B3B",
  black: "#12121A",
  orange: "#FF8A1E",
} as const;

export type LedColor = (typeof LED)[keyof typeof LED];
