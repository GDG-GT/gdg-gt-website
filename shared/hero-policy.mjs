/** Decide before importing WebGL or its dependencies, not after downloading them. */
export function allowHeroMotion({ reducedMotion = false, width = 0, saveData = false,
  effectiveType = '', deviceMemory = 8, hardwareConcurrency = 8 } = {}) {
  return !reducedMotion && width >= 768 && !saveData &&
    !['slow-2g', '2g', '3g'].includes(effectiveType) &&
    deviceMemory > 2 && hardwareConcurrency > 2;
}
