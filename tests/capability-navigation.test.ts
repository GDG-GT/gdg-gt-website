import { afterEach, describe, it, expect, vi } from 'vitest';
import { createElement, StrictMode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { capabilitySignature, formCapabilityNames, navigationChangesContext, readUrlCapability, stripUrlCapabilities } from '../shared/capability-navigation';
import { useUrlCapability } from '../src/hooks/useUrlCapability';
const address = {pathname:'/forms/fictional',search:'?preview=1',hash:'#resume=fixture-value'};
describe('NAV-TEST capability cleanup and private context boundaries', () => {
  afterEach(()=>vi.unstubAllGlobals());
  it('strips only private parameters while preserving exact router history metadata and benign query values', () => {
    const state={idx:3,key:'fictional-router-key',usr:{from:'/admin/forms'}}, history={state,replaceState:vi.fn()};
    expect(stripUrlCapabilities(history,address,formCapabilityNames)).toBe(true);
    expect(history.replaceState).toHaveBeenCalledWith(state,'','/forms/fictional?preview=1');
    expect(history.state).toBe(state);
    history.replaceState.mockClear();
    expect(stripUrlCapabilities(history,{...address,hash:'#main-content'},formCapabilityNames)).toBe(false);
    expect(history.replaceState).not.toHaveBeenCalled();
  });
  it('supports legacy newsletter query capabilities without erasing unrelated URL state', () => {
    const input={pathname:'/newsletter/confirm',search:'?token=fixture-query&source=chapter',hash:''}, history={state:{idx:2},replaceState:vi.fn()};
    expect(readUrlCapability(input,'token')).toBe('');
    expect(readUrlCapability(input,'token',true)).toBe('fixture-query');
    stripUrlCapabilities(history,input,['token'],true);
    expect(history.replaceState).toHaveBeenCalledWith(history.state,'','/newsletter/confirm?source=chapter');
    expect(readUrlCapability({...input,hash:'#token=fixture-fragment'},'token',true)).toBe('fixture-fragment');
  });
  it('canonicalizes key ordering, distinguishes replacements and treats malformed explicit capabilities as a context change', () => {
    const first={...address,hash:'#access=one&resume=two'}, reordered={...address,hash:'#resume=two&access=one'};
    expect(capabilitySignature(first,formCapabilityNames)).toBe(capabilitySignature(reordered,formCapabilityNames));
    expect(capabilitySignature({...address,hash:'#main-content'},formCapabilityNames)).toBeUndefined();
    expect(navigationChangesContext(first,reordered)).toBe(false);
    expect(navigationChangesContext(first,{...first,hash:'#access=other'})).toBe(true);
    expect(navigationChangesContext(first,{...first,hash:'#access='})).toBe(true);
    expect(navigationChangesContext(first,{...first,hash:'#main-content'})).toBe(false);
  });
  it('guards the other capability routes and real path/search changes but leaves ordinary anchors alone', () => {
    for (const [pathname,key] of [['/team/join','invite'],['/account/setup','token'],['/events/fictional','reminder'],['/newsletter/unsubscribe','token']]) {
      const current={pathname,search:'',hash:'#'+key+'=one'};
      expect(navigationChangesContext(current,{...current,hash:'#'+key+'=two'})).toBe(true);
    }
    expect(navigationChangesContext(address,{...address,pathname:'/contact'})).toBe(true);
    expect(navigationChangesContext(address,{...address,search:'?preview=0'})).toBe(true);
    expect(navigationChangesContext({pathname:'/privacy',search:'',hash:''},{pathname:'/privacy',search:'',hash:'#section'})).toBe(false);
  });
  it('captures in local component state without mutating history during repeatable rendering', () => {
    const replaceState=vi.fn(); vi.stubGlobal('window',{location:address,history:{state:{idx:7},replaceState}});
    function Probe(){ const [token]=useUrlCapability('resume'); return createElement('span',null,token==='fixture-value'?'Captured':'Missing'); }
    expect(renderToStaticMarkup(createElement(StrictMode,null,createElement(Probe)))).toContain('Captured');
    expect(replaceState).not.toHaveBeenCalled();
  });
});
