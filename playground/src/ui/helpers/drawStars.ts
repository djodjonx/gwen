/**
 * drawStars — étoiles parallax sur deux couches.
 * Partagé entre BackgroundUI et MainMenuUI.
 */
export function drawStars(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
): void {
  const t = Date.now() / 1000;

  // Couche lente
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 40; i++) {
    const sx = (Math.sin(i * 7.3 + 1) * 0.5 + 0.5) * W;
    const sy = ((Math.sin(i * 3.7) * 0.5 + 0.5) * H + t * (12 + i % 18)) % H;
    ctx.fillRect(sx, sy, 1.2, 1.2);
  }

  // Couche rapide (étoiles plus brillantes)
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 20; i++) {
    const sx = (Math.sin(i * 13.1 + 5) * 0.5 + 0.5) * W;
    const sy = ((Math.cos(i * 4.9) * 0.5 + 0.5) * H + t * (28 + i % 15)) % H;
    ctx.fillRect(sx, sy, 1.8, 1.8);
  }
}

