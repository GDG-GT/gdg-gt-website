import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { allowHeroMotion } from '../../shared/hero-policy.mjs';
import { pictureFallback } from './picture-fallback';

const Objects = lazy(() => import('./HeroObjects'));
function Still() {
  return <div className="gt-hero-objects" aria-hidden="true"><picture className="gt-hero-picture"><source media="(max-width: 480px)" srcSet="/assets/hero-campus-mobile.webp" /><img className="gt-hero-static-objects" data-fallback-src="/assets/hero-campus.webp" ref={pictureFallback} alt="" width="1920" height="800" loading="lazy" decoding="async" fetchPriority="low" /></picture></div>;
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Still /> : this.props.children; }
}
export default function HeroScene() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const device = navigator as Navigator & { deviceMemory?: number; connection?: EventTarget & { saveData?: boolean; effectiveType?: string } };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let intent = false;
    const visible = () => {
      const bounds = document.querySelector('.gt-home-hero')?.getBoundingClientRect();
      return !!bounds && bounds.bottom > 0 && bounds.top < window.innerHeight;
    };
    const check = () => {
      clearTimeout(timer);
      const allowed = allowHeroMotion({ reducedMotion: media.matches, width: window.innerWidth,
        saveData: device.connection?.saveData, effectiveType: device.connection?.effectiveType,
        deviceMemory: device.deviceMemory, hardwareConcurrency: device.hardwareConcurrency });
      // The poster is the initial route. Download the enhancement only after
      // genuine interaction, on capable devices, with the hero still in view.
      if (!allowed || document.hidden) setReady(false);
      else if (intent && visible()) timer = setTimeout(() => {
        if (visible() && !document.hidden) setReady(true);
      }, 1200);
    };
    const interact = () => { intent = true; check(); };
    check();
    media.addEventListener('change', check);
    window.addEventListener('resize', check);
    document.addEventListener('visibilitychange', check);
    device.connection?.addEventListener('change', check);
    window.addEventListener('pointermove', interact, { once: true, passive: true });
    window.addEventListener('pointerdown', interact, { once: true, passive: true });
    window.addEventListener('keydown', interact, { once: true });
    window.addEventListener('scroll', interact, { passive: true });
    return () => {
      clearTimeout(timer);
      media.removeEventListener('change', check);
      window.removeEventListener('resize', check);
      document.removeEventListener('visibilitychange', check);
      device.connection?.removeEventListener('change', check);
      window.removeEventListener('pointermove', interact);
      window.removeEventListener('pointerdown', interact);
      window.removeEventListener('keydown', interact);
      window.removeEventListener('scroll', interact);
    };
  }, []);
  return ready ? <SceneBoundary><Suspense fallback={<Still />}><Objects /></Suspense></SceneBoundary> : <Still />;
}
