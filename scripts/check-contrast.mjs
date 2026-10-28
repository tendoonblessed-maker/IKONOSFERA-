// WCAG relative luminance, no dependencies.
const palette = {
  background: '#000000', layer: '#0a0a0a', raised: '#111111',
  text: '#f5f5f5', secondary: '#a1a1a1', subdued: '#8a8a8a',
  accentTeal: '#4dd0c7', accentAmber: '#ffb84d',
};
function lum(hex) {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255);
  return rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
for (const [fg, bg, minimum] of [
  ['text', 'background', 4.5], ['secondary', 'background', 4.5],
  ['subdued', 'background', 4.5], ['secondary', 'layer', 4.5],
  ['subdued', 'raised', 4.5], ['accentTeal', 'background', 4.5],
  ['accentAmber', 'background', 4.5]
]) {
  const actual = ratio(palette[fg], palette[bg]);
  console.log(`${fg} / ${bg}: ${actual.toFixed(2)}:1 ${actual >= minimum ? 'PASS' : 'FAIL'}`);
  if (actual < minimum) process.exitCode = 1;
}
