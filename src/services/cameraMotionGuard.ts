/** Returns true only when a substantial fraction of the frame changed together. */
export function isGlobalCameraMotion(previous: ArrayLike<number>, current: ArrayLike<number>): boolean {
  if (previous.length === 0 || previous.length !== current.length) return false;

  let changedPixels = 0;
  let totalDifference = 0;
  for (let i = 0; i < current.length; i++) {
    const difference = Math.abs(current[i] - previous[i]);
    totalDifference += difference;
    if (difference >= 25) changedPixels++;
  }

  return changedPixels / current.length >= 0.38 && totalDifference / current.length >= 18;
}
