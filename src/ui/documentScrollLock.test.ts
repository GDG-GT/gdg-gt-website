import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { lockDocumentScroll } from '../lib/documentScrollLock';

function fixture() {
  return {
    body: { style: { overflow: '', position: '', top: '', width: '' } },
    documentElement: { style: { overflow: '' } },
    defaultView: { scrollY: 420, scrollTo: vi.fn() },
  };
}
describe('native page scrolling', () => {
  it('restores styles and position when the last owner releases', () => {
    const doc = fixture();
    const first = lockDocumentScroll(doc as unknown as Document);
    const second = lockDocumentScroll(doc as unknown as Document);
    first();
    expect(doc.body.style.position).toBe('fixed');
    expect(doc.defaultView.scrollTo).not.toHaveBeenCalled();
    second();
    expect(doc.body.style).toEqual({ overflow: '', position: '', top: '', width: '' });
    expect(doc.documentElement.style.overflow).toBe('');
    expect(doc.defaultView.scrollTo).toHaveBeenCalledWith({ top: 420, behavior: 'instant' });
  });
  it('release is idempotent and works in reverse order', () => {
    const doc = fixture();
    const first = lockDocumentScroll(doc as unknown as Document);
    const second = lockDocumentScroll(doc as unknown as Document);
    second();
    second();
    expect(doc.body.style.overflow).toBe('hidden');
    first();
    expect(doc.defaultView.scrollTo).toHaveBeenCalledTimes(1);
  });
  it('preserves pre-existing inline styles', () => {
    const doc = fixture();
    doc.body.style.width = '80%';
    doc.documentElement.style.overflow = 'auto';
    lockDocumentScroll(doc as unknown as Document)();
    expect(doc.body.style.width).toBe('80%');
    expect(doc.documentElement.style.overflow).toBe('auto');
  });
  it('does not globally disable native scroll chaining', () => {
    const styles = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    expect(styles).not.toMatch(/overscroll-behavior:\s*none/);
    expect(styles).not.toMatch(/\*\s*\{[^}]*overscroll-behavior/s);
  });
});
