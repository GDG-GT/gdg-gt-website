import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useCacheInvalidation } from '../src/hooks/useCacheInvalidation';
import { clearContentCache, clearSpecificCache, forceRefreshContent } from '../src/utils/serviceWorker';
vi.mock('../src/utils/serviceWorker', () => ({
  clearContentCache: vi.fn(async () => false),
  clearSpecificCache: vi.fn(async () => false),
  forceRefreshContent: vi.fn(),
}));
describe('PWA-TEST cache invalidation boundaries', () => {
  it('all-content invalidation does not accidentally call the similarly named per-route callback', async () => {
    let actions: ReturnType<typeof useCacheInvalidation> | undefined;
    function Probe() { actions = useCacheInvalidation(); return null; }
    renderToString(createElement(Probe));
    if (!actions) throw Error('Hook did not render');
    await actions.clearAllContentCache();
    expect(clearContentCache).toHaveBeenCalledOnce();
    expect(clearSpecificCache).not.toHaveBeenCalled();
    await actions.clearContentCache();
    expect(clearSpecificCache).toHaveBeenLastCalledWith('/api/content');
    await actions.clearEventsCache();
    expect(clearSpecificCache).toHaveBeenLastCalledWith('/api/events');
    await actions.clearTeamCache();
    expect(clearSpecificCache).toHaveBeenLastCalledWith('/api/team');
    await actions.clearProjectsCache();
    expect(clearSpecificCache).toHaveBeenLastCalledWith('/api/projects');
    actions.forceRefresh();
    expect(forceRefreshContent).toHaveBeenCalledOnce();
  });
});
