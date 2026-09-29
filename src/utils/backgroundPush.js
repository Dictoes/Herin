import {supabase} from '../lib/supabase';

let active=false, revision=0;
export const backgroundPushActive=()=>active;
export const backgroundPushSupported=()=>typeof window!=='undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function registration(){
  const reg=await navigator.serviceWorker.getRegistration();
  if(!reg?.active)throw Error('Reload Herin to finish preparing notifications, then try again.');
  return reg;
}
async function owner(reg,userId){
  await new Promise((resolve,reject)=>{
    const channel=new MessageChannel();const timer=setTimeout(()=>reject(Error('Reload Herin to update notification support.')),5000);
    channel.port1.onmessage=()=>{clearTimeout(timer);channel.port1.close();resolve();};
    reg.active.postMessage({type:'PUSH_OWNER',userId},[channel.port2]);
  });
}
async function invoke(body){
  const {data,error}=await supabase.functions.invoke('push-notifications',{body});
  let message=data?.error;
  if(error?.context)try{message=(await error.context.json()).error;}catch{/* non-JSON gateway error */}
  if(error||message)throw Error(message||'Could not connect to notification setup. Please retry.');
  return data;
}
export async function testBackgroundPush(){
  const reg=await registration(),sub=await reg.pushManager.getSubscription();
  if(!sub)throw Error('Enable background reminders first.');
  await invoke({action:'test',endpoint:sub.endpoint});
}
export async function enableBackgroundPush(userId){
  const current=++revision;
  if(!backgroundPushSupported())throw Error('Use a supported browser. On iPhone or iPad, add Herin to your Home Screen and open it there.');
  // Request permission directly from the button gesture (required on iOS).
  if(await Notification.requestPermission()!=='granted')throw Error('Allow notifications in your browser settings to enable background reminders.');
  const reg=await registration();
  const {publicKey}=await invoke({action:'public-key'});
  const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  let subscription=await reg.pushManager.getSubscription();
  if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await invoke({action:'subscribe',subscription:subscription.toJSON(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
  if(current!==revision)return false;
  await owner(reg,userId);active=true;
  return true;
}
export async function restoreBackgroundPush(userId){
  const current=++revision;
  active=false;
  if(!backgroundPushSupported())return false;
  const reg=await navigator.serviceWorker.getRegistration();if(!reg?.active)return false;
  const sub=await reg.pushManager.getSubscription();if(!sub)return false;
  const {data,error}=await supabase.from('push_subscriptions').select('id,timezone').eq('user_id',userId).eq('endpoint',sub.endpoint).maybeSingle();
  if(current!==revision)return false;
  if(error||!data||Notification.permission!=='granted'){await owner(reg,null);return false;}
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  if(data.timezone!==timezone)await invoke({action:'subscribe',subscription:sub.toJSON(),timezone});
  if(current!==revision)return false;
  await owner(reg,userId);active=true;return true;
}
export async function disableBackgroundPush(){
  revision++;
  active=false;
  if(!backgroundPushSupported())return;
  const reg=await navigator.serviceWorker.getRegistration();if(!reg?.active)return;
  const sub=await reg.pushManager.getSubscription();if(!sub)return;
  // First suppress queued messages on this device, then revoke delivery at source.
  await owner(reg,null);
  const {error}=await supabase.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);
  if(error)throw Error('Could not disable background reminders. Reconnect and retry before logging out.');
  await sub.unsubscribe();
}
export async function clearPushOwner(){
  revision++;
  active=false;
  if(!backgroundPushSupported())return;
  const reg=await navigator.serviceWorker.getRegistration();if(reg?.active&&await reg.pushManager.getSubscription())await owner(reg,null);
}
