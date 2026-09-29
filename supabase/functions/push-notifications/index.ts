import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';
import {dueNotifications,validSubscription} from './core.js';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const env=(name:string)=>Deno.env.get(name)||'';
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const check=(r:any)=>{if(r.error)throw Error('Database operation failed');return r.data;};
async function all(table:string,columns:string,user?:string){
 const rows:any[]=[];
 for(let offset=0;;offset+=1000){let q=db.from(table).select(columns).order('id').range(offset,offset+999);if(user)q=q.eq('user_id',user);const page=check(await q);rows.push(...page);if(page.length<1000)return rows;}
}
async function deliver(subscription:any,payload:any){
 if(!validSubscription(subscription))throw Error('Invalid push endpoint');
 // Use the library for encryption/signing and fetch for the edge runtime transport.
 const request=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:Math.max(0,Math.min(900,Math.floor((Date.parse(payload.expiresAt)-Date.now())/1000))),urgency:'normal',vapidDetails:{subject:'https://herin-phi.vercel.app',publicKey:env('PUSH_PUBLIC_KEY'),privateKey:env('PUSH_PRIVATE_KEY')}});
 const response=await fetch(request.endpoint,{method:'POST',headers:request.headers,body:new Uint8Array(request.body),redirect:'error',signal:AbortSignal.timeout(10000)});
 return response.status;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try {
  if(!env('PUSH_PUBLIC_KEY')||!env('PUSH_PRIVATE_KEY'))return json({error:'Push notifications are not configured yet.'},503);
  const body=await req.json();
  if(body.action==='dispatch'){
   if(!env('PUSH_CRON_SECRET')||req.headers.get('x-push-secret')!==env('PUSH_CRON_SECRET'))return json({error:'Unauthorized'},401);
   const started=Date.now();let sent=0,failed=0;
   const devices=await all('push_subscriptions','*');
   const owners=new Map();
   for(const device of devices){
    if(Date.now()-started>45000)break;
    if(!owners.has(device.user_id)){
     const pref=check(await db.from('user_preferences').select('push_notifications,data').eq('user_id',device.user_id).maybeSingle());
     owners.set(device.user_id,pref?.push_notifications?{pref,classes:await all('classes','id,name,data,schedule_pattern',device.user_id),reminders:await all('reminders','id,title,remind_at,is_completed',device.user_id)}:null);
    }
    const owner=owners.get(device.user_id);if(!owner)continue;
    for(const item of dueNotifications(owner.classes,owner.reminders,device.timezone,owner.pref.data?.settings?.reminderMinutes)){
     if(Date.now()-started>45000)break;
     const claimed=check(await db.rpc('claim_push_delivery',{p_subscription:device.id,p_key:item.key}));if(!claimed)continue;
     try{
      const code=await deliver(device.subscription,{...item,userId:device.user_id,tag:item.key});
      if(code===404||code===410){check(await db.from('push_subscriptions').delete().eq('id',device.id));break;}
      if(code<200||code>=300){failed++;continue;}
      check(await db.from('push_deliveries').update({sent_at:new Date().toISOString()}).eq('subscription_id',device.id).eq('event_key',item.key));sent++;
     }catch{failed++;}
    }
   }
   // Keep the delivery ledger bounded; old class occurrences cannot be due again.
   check(await db.from('push_deliveries').delete().lt('created_at',new Date(Date.now()-7*86400000).toISOString()));
   console.log(JSON.stringify({event:'push_dispatch',sent,failed,devices:devices.length}));
   return json({sent,failed});
  }
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'Sign in to manage notifications.'},401);
  const {data,error}=await db.auth.getUser(token);if(error||!data.user)return json({error:'Sign in to manage notifications.'},401);
  if(body.action==='public-key')return json({publicKey:env('PUSH_PUBLIC_KEY')});
  if(body.action==='test'){
   const device=check(await db.from('push_subscriptions').select('*').eq('user_id',data.user.id).eq('endpoint',body.endpoint||'').maybeSingle());
   if(!device)return json({error:'Enable background reminders on this device first.'},400);
   const key=`test:${Math.floor(Date.now()/60000)}`;
   if(!check(await db.rpc('claim_push_delivery',{p_subscription:device.id,p_key:key})))return json({error:'Wait one minute before sending another test.'},429);
   const code=await deliver(device.subscription,{userId:data.user.id,title:'Herin notifications are connected',body:'This test was sent from the Herin notification server.',tag:key,url:'/#/settings',expiresAt:new Date(Date.now()+60000).toISOString()});
   if(code===404||code===410){check(await db.from('push_subscriptions').delete().eq('id',device.id));return json({error:'This subscription expired. Disable and re-enable background reminders.'},400);}
   if(code<200||code>=300)return json({error:'The push service could not accept the test. Please retry later.'},503);
   check(await db.from('push_deliveries').update({sent_at:new Date().toISOString()}).eq('subscription_id',device.id).eq('event_key',key));
   return json({sent:true});
  }
  if(body.action==='subscribe'){
   if(!validSubscription(body.subscription))return json({error:'This push service is not supported.'},400);
   try{new Intl.DateTimeFormat('en',{timeZone:body.timezone}).format();if(typeof body.timezone!=='string')throw Error();}catch{return json({error:'Invalid time zone.'},400);}
   const existing=check(await db.from('push_subscriptions').select('id,user_id').eq('endpoint',body.subscription.endpoint).maybeSingle());
   if(existing&&existing.user_id!==data.user.id)return json({error:'Disable notifications on the previous account first.'},409);
   const count=await db.from('push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',data.user.id);
   if(count.error)throw Error();if(!existing&&(count.count||0)>=10)return json({error:'This account has reached its 10-device notification limit.'},400);
   check(await db.from('push_subscriptions').upsert({user_id:data.user.id,endpoint:body.subscription.endpoint,subscription:body.subscription,timezone:body.timezone,updated_at:new Date().toISOString()},{onConflict:'endpoint'}));
   return json({subscribed:true});
  }
  return json({error:'Unknown action'},400);
 }catch{return json({error:'Notifications could not be updated. Please retry.'},503);}
});
