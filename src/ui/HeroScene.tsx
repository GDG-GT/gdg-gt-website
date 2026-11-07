import { useInitialPictureSource } from "./public-hydration";
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { allowHeroMotion } from '../../shared/hero-policy.mjs';
import { pictureFallback } from './picture-fallback';

const Objects = lazy(() => import('./HeroObjects'));
function Still({ pending = false }: { pending?: boolean }) {
  const initialPicture = useInitialPictureSource("/assets/hero-campus.webp");
  return <div className="gt-hero-objects" data-motion-pending={pending || undefined} aria-hidden="true"><picture className="gt-hero-picture"><source media="(max-width: 480px)" srcSet="/assets/hero-campus-mobile.webp" /><img className="gt-hero-static-objects" data-fallback-src="/assets/hero-campus.webp" src={initialPicture} ref={pictureFallback} alt="" width="1920" height="800" loading="lazy" decoding="async" fetchPriority="low" /></picture></div>;
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Still /> : this.props.children; }
}
export default function HeroScene() {
  const [mode, setMode] = useState<"motion" | "still" | "pending">("pending");
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const device = navigator as Navigator & { deviceMemory?: number; connection?: EventTarget & { saveData?: boolean; effectiveType?: string } };
    const check = () => {
      const allowed = allowHeroMotion({ reducedMotion: media.matches, width: window.innerWidth,
        saveData: device.connection?.saveData, effectiveType: device.connection?.effectiveType,
        deviceMemory: device.deviceMemory, hardwareConcurrency: device.hardwareConcurrency });
      // Start the actual scene on mount. Never show a different poster while
      // its module downloads or its shaders compile on capable desktops.
      setMode(allowed ? "motion" : "still");
    };
    check();
    media.addEventListener('change', check);
    window.addEventListener('resize', check);
    device.connection?.addEventListener('change', check);
    return () => {
      media.removeEventListener('change', check);
      window.removeEventListener('resize', check);
      device.connection?.removeEventListener('change', check);
    };
  }, []);
  return mode === "motion"
    ? <SceneBoundary><Suspense fallback={null}><Objects /></Suspense></SceneBoundary>
    : <Still pending={mode === "pending"} />;
}
