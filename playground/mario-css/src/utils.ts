/**
 * Utilitaires purs — aucune dépendance externe.
 */

/** Déplace `current` vers `target` par un pas max de `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** Clamp une valeur entre min et max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
