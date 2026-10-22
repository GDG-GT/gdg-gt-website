import { useEffect, useState } from 'react';
import { readUrlCapability, stripUrlCapabilities } from '../../shared/capability-navigation';
/** Read during initialization, strip only after commit. No module-global token
 * cache or history mutation during React's repeatable render phase. */
export function useUrlCapability(name: string, allowQuery = false) {
  const state = useState(() => readUrlCapability(window.location,name,allowQuery));
  useEffect(() => { stripUrlCapabilities(window.history,window.location,[name],allowQuery); },[name,allowQuery]);
  return state;
}
