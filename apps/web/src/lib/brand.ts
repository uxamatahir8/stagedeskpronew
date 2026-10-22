/**
 * CSS variables that recolour primary buttons and accents with an agency's
 * brand colour, picking black or white text for readable contrast.
 */
export function brandStyle(hex: string | null | undefined): React.CSSProperties | undefined {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return {
    "--primary": hex,
    "--primary-foreground": luminance > 0.45 ? "#111111" : "#ffffff",
    "--ring": hex,
  } as React.CSSProperties;
}
