import React, {useEffect, useRef, useState} from 'react';
import {Clock3} from 'lucide-react';
import {supabase} from '../../lib/supabase';
import {cloudUser} from '../../utils/cloudStore';
import {readGenerationQuota, quotaCountdown} from '../../utils/generationQuota';

export default function GenerationAllowance({busy, onExhaustedChange}) {
  const [quota, setQuota] = useState(null), [error, setError] = useState(false), [now, setNow] = useState(Date.now());
  const refresh = useRef(() => {});
  useEffect(() => {
    let active = true, sequence = 0;
    const owner = cloudUser();
    const load = async () => {
      const request = ++sequence;
      try {
        const {data, error: rpcError} = await supabase.rpc('get_study_generation_quota');
        if (rpcError) throw rpcError;
        const next = readGenerationQuota(data);
        if (active && request === sequence && cloudUser() === owner) {
          setQuota(next); setError(false); setNow(Date.now()); onExhaustedChange(next.remaining === 0);
        }
      } catch {
        if (active && request === sequence && cloudUser() === owner) {setError(true); onExhaustedChange(false);}
      }
    };
    refresh.current = load;
    void load();
    const poll = setInterval(load, 30000);
    const focus = () => {if (document.visibilityState === 'visible') void load();};
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => {active = false; clearInterval(poll); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus);};
  }, [busy, onExhaustedChange]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!quota) return;
    const reset = setTimeout(() => {setNow(Date.now()); void refresh.current();}, Math.max(0, quota.deadline - Date.now()) + 100);
    return () => clearTimeout(reset);
  }, [quota]);
  const expired = quota && now >= quota.deadline;
  return <aside className="ai-allowance" aria-label="Generation allowance">
    <div className="ai-allowance-heading"><strong aria-live="polite">{error ? 'Allowance unavailable' : !quota ? 'Checking generation allowance…' : expired ? 'Refreshing generation allowance…' : `${quota.remaining} of ${quota.limit} generations remaining`}</strong>
      {quota && !error && <span><Clock3 size={14} aria-hidden="true"/>{expired ? 'Checking reset…' : `Resets in ${quotaCountdown(quota.deadline, now)}`}</span>}</div>
    {quota && !error && !expired && <progress aria-label="Generations remaining" max={quota.limit} value={quota.remaining}/>}
    <p>20 generations per 8-hour window, shared across PDFs, quizzes, flashcards and summaries. Generate Both uses one.</p>
    {error ? <div><span>Could not load your balance. Generation still checks your allowance securely.</span> <button className="btn btn-ghost btn-sm" onClick={() => refresh.current()}>Refresh allowance</button></div> : quota && <small>Full reset: <time dateTime={quota.resets_at}>{new Date(quota.resets_at).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}</time> (your local time). Gemini limits also apply.</small>}
  </aside>;
}
