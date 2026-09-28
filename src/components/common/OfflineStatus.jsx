import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {getSyncStatus,subscribeSync,flushCloud} from '../../utils/cloudStore';
export default function OfflineStatus({details=false}) {
 const status=useSyncExternalStore(subscribeSync,getSyncStatus);
 const [busy,setBusy]=useState(false);
 const [waiting,setWaiting]=useState(null),[offlineReady,setOfflineReady]=useState(false),[online,setOnline]=useState(navigator.onLine);
 const [updated,setUpdated]=useState(false);
 useEffect(()=>{
  let previous=navigator.serviceWorker?.controller;
  const change=()=>{const next=navigator.serviceWorker?.controller;if(previous&&next!==previous)setUpdated(true);previous=next;};
  navigator.serviceWorker?.addEventListener('controllerchange',change);
  return()=>navigator.serviceWorker?.removeEventListener('controllerchange',change);
 },[]);
 useEffect(()=>{
  let active=true;
  const network=()=>setOnline(navigator.onLine);
  const check=async()=>{try{const registration=await navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL);if(!active||!registration)return;setWaiting(registration.waiting);if(registration.active){const channel=new MessageChannel();channel.port1.onmessage=e=>{if(active)setOfflineReady(!!e.data.ready);channel.port1.close();};registration.active.postMessage('OFFLINE_STATUS',[channel.port2]);}}catch{}};
  check();const interval=setInterval(check,4000);window.addEventListener('online',network);window.addEventListener('offline',network);
  return()=>{active=false;clearInterval(interval);window.removeEventListener('online',network);window.removeEventListener('offline',network);};
 },[]);
 return <div className={details?'offline-settings':'connection-status'} role="status"><span>{!online&&status.state==='saved'?'Offline · Last changes saved to Supabase':status.message}</span>
 {['error','offline'].includes(status.state)&&<button className="btn btn-secondary btn-sm" disabled={busy} onClick={async()=>{setBusy(true);try{await flushCloud();}catch{}finally{setBusy(false);}}}>Retry sync</button>}
 {details&&<><p>{offlineReady?'App ready for offline access.':'Preparing offline app access; keep this page open while online.'} Previously opened PDFs are cached on this device.</p><p>Changes are cached on this device until Supabase confirms them. Keep Herin open while saving. Reconnect to upload or download PDFs. On iPhone, use Safari → Share → Add to Home Screen to install Herin.</p></>}
 {(waiting||updated)&&<button className="btn btn-secondary btn-sm" onClick={async()=>{try{await flushCloud();if(updated){location.reload();return;}navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});waiting.postMessage('ACTIVATE_UPDATE');}catch{}}}>Update ready · Reload</button>}
 </div>;
}
