import { describe, it, expect } from 'vitest';
import { allowHeroMotion } from '../../shared/hero-policy.mjs';
describe('UI-TEST-3D: decide before downloading the decorative scene', () => {
  const desktop = { width: 1440 };
  it('keeps interactive motion on capable desktop devices', () => {
    expect(allowHeroMotion(desktop)).toBe(true);
    expect(allowHeroMotion({ ...desktop, effectiveType: '4g' })).toBe(true);
  });
  it('uses the static fallback for every limited-device condition', () => {
    for (const constraint of [{ reducedMotion: true }, { width: 375 }, { saveData: true },
      { effectiveType: 'slow-2g' }, { effectiveType: '2g' }, { effectiveType: '3g' },
      { deviceMemory: 2 }, { hardwareConcurrency: 2 }])
      expect(allowHeroMotion({ ...desktop, ...constraint })).toBe(false);
    expect(allowHeroMotion()).toBe(false);
  });
});
