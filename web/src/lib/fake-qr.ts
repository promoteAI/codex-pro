/** Seeded fake QR SVG so demos need no QR library — the encoded link is what matters. */
export function buildQrSvg(seed: number): string {
  const n = 21;
  const cells: number[][] = [];
  let s = seed || 1;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const setFinder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        cells[oy + y][ox + x] = edge || core ? 1 : 0;
      }
    }
  };
  for (let y = 0; y < n; y++) {
    cells[y] = [];
    for (let x = 0; x < n; x++) cells[y][x] = rnd() > 0.55 ? 1 : 0;
  }
  setFinder(0, 0);
  setFinder(n - 7, 0);
  setFinder(0, n - 7);
  const parts: string[] = [];
  const step = 100 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!cells[y][x]) continue;
      parts.push(
        `<rect x="${(x * step).toFixed(2)}%" y="${(y * step).toFixed(2)}%" width="${step.toFixed(2)}%" height="${step.toFixed(2)}%" fill="#111"/>`,
      );
    }
  }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join("")}</svg>`;
}
