import { useCallback, useEffect, useRef, useState } from 'react';
import { cloudUser } from './cloudStore';

export default function usePersistedState(read, write) {
  const [value, setValue] = useState(read);
  const current = useRef(value);
  const writer = useRef(write);
  const owner = useRef(cloudUser());
  const reader = useRef(read);
  useEffect(()=>{const refresh=()=>{if(owner.current!==cloudUser())return;const next=reader.current();current.current=next;setValue(next);};window.addEventListener('herin-cloud-refresh',refresh);return()=>window.removeEventListener('herin-cloud-refresh',refresh);},[]);
  // Persist the account-scoped pending snapshot before updating the UI.
  // The global sync indicator reports when Supabase confirms the queued changes.
  const set = useCallback(update => {
    if (owner.current !== cloudUser()) return false;
    const next = typeof update === 'function' ? update(current.current) : update;
    if (!writer.current(next)) return false;
    current.current = next;
    setValue(next);
    return true;
  }, []);
  return [value, set];
}
