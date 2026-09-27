import { createRepository } from './cloudRepository';
import { mergeWorkspace } from './mergeWorkspace';

let active = null;
let status = {state:'loading',message:'Connecting to Supabase…'};
const listeners = new Set();
export const getSyncStatus = () => status;
export const subscribeSync = fn => { listeners.add(fn); return ()=>listeners.delete(fn); };
function report(state,message) {status={state,message};listeners.forEach(fn=>fn());}
export const cloudActive = () => !!active;
export const cloudUser = () => active?.userId;
export const cloudRead = (key,fallback) => active?.model[key] ?? fallback;
const cacheKey = id => `herin:cloud:${id}`;
function persist(ctx) {localStorage.setItem(cacheKey(ctx.userId),JSON.stringify({model:ctx.model,base:ctx.pending?ctx.base:undefined,pending:ctx.pending}));}
export function cloudWrite(key,value) {
  const ctx=active; if(!ctx) return false;
  const before=ctx.model,wasPending=ctx.pending; ctx.model={...ctx.model,[key]:value};ctx.pending=true;
  try {persist(ctx);} catch {ctx.model=before;ctx.pending=wasPending;report('error','Device storage is full. This change was not saved.');return false;}
  report('pending','Saving to Supabase…');
  clearTimeout(ctx.timer);ctx.timer=setTimeout(()=>flushCloud().catch(()=>{}),250);
  return true;
}
export async function openCloud(client,userId) {
  closeCloud();
  const ctx={userId,repository:createRepository(client,userId),model:{},pending:false,flight:null,loaded:false};
  active=ctx;report('loading','Loading your workspace…');
  let cached;try {cached=JSON.parse(localStorage.getItem(cacheKey(userId))||'null');} catch {}
  try {
    const remote=await ctx.repository.load();
    ctx.loaded=true;
    if(active!==ctx) return false;
    ctx.base=remote;ctx.model=cached?.pending?mergeWorkspace(cached.base||{},cached.model,remote):remote;ctx.pending=!!cached?.pending;
    persist(ctx);
    if(ctx.pending) await flushCloud();else report('saved','Saved to Supabase');
  } catch(error) {
    if(active!==ctx) return false;
    // Offline access is possible only for a previously loaded account.
    if(cached && navigator.onLine===false) {ctx.model=cached.model;ctx.base=cached.base||cached.model;ctx.pending=!!cached.pending;report('offline','Offline · Changes stay on this device until reconnected');}
    else {active=null;throw error;}
  }
  return true;
}
export async function flushCloud() {
  const ctx=active;if(!ctx) return;
  if(ctx.flight) {await ctx.flight; if(ctx.pending) return flushCloud(); return;}
  if(!ctx.pending) return;
  ctx.flight=(async()=>{
    while(ctx.pending && active===ctx) {
      let snapshot=ctx.model;
      try {
        if(navigator.onLine===false) throw new Error('Offline. Reconnect to save to Supabase.');
        if(!ctx.loaded) {const remote=await ctx.repository.load();ctx.model=mergeWorkspace(ctx.base,ctx.model,remote);ctx.base=remote;ctx.loaded=true;snapshot=ctx.model;window.dispatchEvent(new Event('herin-cloud-refresh'));}
        await ctx.repository.save(snapshot);
        if(active!==ctx)return;
        ctx.base=snapshot;ctx.pending=ctx.model!==snapshot;persist(ctx);
        report(ctx.pending?'pending':'saved',ctx.pending?'Saving to Supabase…':'Saved to Supabase');
      } catch(error) {if(active===ctx)report('error',`Not synced: ${error.message}`);throw error;}
    }
  })();
  try {await ctx.flight;} finally {ctx.flight=null;}
}
export function closeCloud() {if(active)clearTimeout(active.timer);active=null;}
export async function uploadCloudPdf(id,file) {if(!active)throw Error('Sign in to upload PDFs.');return active.repository.upload(id,file);}
export async function downloadCloudPdf(id) {if(!active)throw Error('Sign in to open PDFs.');const p=active.model.pdfs?.find(p=>p.id===id);return active.repository.download(id,p?.filePath);}
export async function removeCloudPdf(id) {if(!active)throw Error('Sign in to delete PDFs.');const p=active.model.pdfs?.find(p=>p.id===id);if(p?.kind==='note')return;await active.repository.remove(id,p?.filePath);}
if(typeof window!=='undefined') {
  window.addEventListener('online',()=>flushCloud().catch(()=>{}));
  window.addEventListener('beforeunload',event=>{if(active?.pending){event.preventDefault();event.returnValue='';}});
}
