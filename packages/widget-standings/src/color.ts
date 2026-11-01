/** Keep the session hue. Retune saturation and lightness onto the Tokyo Night range. */
export function tokyo(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    return hex;
  }
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  if (max !== min) {
    const span = max - min;
    if (max === red) {
      hue = ((green - blue) / span) % 6;
    } else if (max === green) {
      hue = (blue - red) / span + 2;
    } else {
      hue = (red - green) / span + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }
  return hsl(hue, 0.62, 0.72);
}

function hsl(hue: number, saturation: number, lightness: number): string {
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number): string => {
    const k = (offset + hue / 30) % 12;
    const value = lightness - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
