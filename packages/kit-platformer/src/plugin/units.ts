export type PlatformerUnits = 'pixels' | 'meters';

export const DEFAULT_PLATFORMER_UNITS: PlatformerUnits = 'pixels';
export const DEFAULT_PIXELS_PER_METER = 50;

export function toPhysicsScalar(
  value: number,
  units: PlatformerUnits,
  pixelsPerMeter: number,
): number {
  if (units === 'meters') return value;
  const ppm =
    Number.isFinite(pixelsPerMeter) && pixelsPerMeter > 0
      ? pixelsPerMeter
      : DEFAULT_PIXELS_PER_METER;
  return value / ppm;
}
