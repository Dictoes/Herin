import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {dueNotifications,validSubscription} from '../supabase/functions/push-notifications/core.js';
const lesson={id:'class-id',name:'Engineering',data:{days:[3],startTime:'00:05'}};
test('class reminders cross midnight in the device time zone with stable occurrence keys',()=>{
 const now=new Date('2026-09-29T15:55:15Z');
 const first=dueNotifications([lesson],[],'Asia/Manila',15,now);
 assert.equal(first.length,1);assert.equal(first[0].expiresAt,'2026-09-29T16:05:00.000Z');
 assert.equal(dueNotifications([lesson],[],'Asia/Manila',15,new Date(+now+60000))[0].key,first[0].key);
 assert.equal(dueNotifications([lesson],[],'UTC',15,now).length,0);
 assert.equal(dueNotifications([lesson],[],'Not/AZone',15,now).length,0);
 assert.equal(dueNotifications([lesson],[],'Asia/Manila',5,now).length,0);
});
test('DST nonexistent local times and past classes never produce reminders',()=>{
 const row={...lesson,data:{days:[0],startTime:'02:10'}};
 assert.equal(dueNotifications([row],[],'America/New_York',30,new Date('2026-03-08T06:55:00Z')).length,0);
 assert.equal(dueNotifications([lesson],[],'Asia/Manila',15,new Date('2026-09-29T16:06:00Z')).length,0);
});
test('saved reminders exclude completed, future, malformed, and stale items',()=>{
 const now=new Date('2026-09-30T10:00:00Z');
 const reminders=[{id:'due',title:'Study',remind_at:'2026-09-30T09:59:00Z'},{id:'done',is_completed:true,remind_at:now.toISOString()},{id:'old',remind_at:'2026-09-29T10:00:00Z'},{id:'future',remind_at:'2026-09-30T11:00:00Z'},{id:'bad',remind_at:'invalid'}];
 assert.deepEqual(dueNotifications([],reminders,'UTC',15,now).map(n=>n.title),['Study']);
});
test('pending assignments notify using the configured lead time and expire at the deadline',()=>{
 const now=new Date('2026-09-30T10:00:00Z');
 const assignments=[
  {id:'due-soon',title:'Essay',due_date:'2026-09-30T10:10:00Z',status:'pending'},
  {id:'in-progress',title:'Lab report',due_date:'2026-09-30T10:15:00Z',status:'in_progress'},
  {id:'completed',title:'Finished work',due_date:'2026-09-30T10:05:00Z',status:'completed'},
  {id:'too-early',title:'Later',due_date:'2026-09-30T10:16:00Z',status:'pending'},
  {id:'overdue',title:'Past due',due_date:'2026-09-30T09:59:00Z',status:'pending'},
  {id:'invalid',title:'Invalid date',due_date:'invalid',status:'pending'}
 ];
 const notifications=dueNotifications([],[],'UTC',15,now,assignments);
 assert.deepEqual(notifications.map(n=>n.title),['Essay','Lab report']);
 assert.equal(notifications[0].body,'Assignment due in 10 minutes.');
 assert.equal(notifications[0].key,'assignment:due-soon:2026-09-30T10:10:00.000Z');
 assert.equal(notifications[0].expiresAt,'2026-09-30T10:10:00.000Z');
 assert.deepEqual(dueNotifications([],[],'UTC',5,now,assignments).map(n=>n.title),[]);
});
test('assignment reminders remain eligible after a delayed scheduler tick but never fire at or after the deadline',()=>{
 const assignment={id:'essay',title:'Essay',due_date:'2026-09-30T10:10:00Z',status:'pending'};
 const delayed=dueNotifications([],[],'UTC',5,new Date('2026-09-30T10:06:00Z'),[assignment]);
 assert.equal(delayed.length,1);
 assert.equal(delayed[0].body,'Assignment due in 4 minutes.');
 assert.equal(dueNotifications([],[],'UTC',5,new Date(assignment.due_date),[assignment]).length,0);
});
test('class and assignment notifications are both included in the same dispatch',()=>{
 const now=new Date('2026-09-30T10:00:00Z');
 const scheduledClass={id:'class-id',name:'Engineering',data:{days:[3],startTime:'10:15'}};
 const assignment={id:'essay',title:'Essay',due_date:'2026-09-30T10:10:00Z',status:'pending'};
 assert.deepEqual(
  dueNotifications([scheduledClass],[],'UTC',15,now,[assignment]).map(notification=>notification.title),
  ['Upcoming class: Engineering','Essay']
 );
});
test('push endpoints cannot target arbitrary or internal hosts',()=>{
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}};
 assert.ok(validSubscription(subscription));
 for(const endpoint of ['http://fcm.googleapis.com/x','https://localhost/x','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:444/x','https://user@fcm.googleapis.com/x'])assert.ok(!validSubscription({...subscription,endpoint}));
 assert.ok(!validSubscription({...subscription,keys:{}}));
});
test('service worker displays push without an open page, isolates accounts and handles click',async()=>{
 const events={},shown=[],opened=[];let stored={userId:'owner'};
 const cache={match:async()=>new Response(JSON.stringify(stored)),put:async(_key,response)=>{stored=await response.json();}};
 const self={location:{origin:'https://herin.test'},registration:{scope:'https://herin.test/',showNotification:async(...args)=>shown.push(args),getNotifications:async()=>[]},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},addEventListener:(type,fn)=>events[type]=fn};
 const source=readFileSync('scripts/sw-template.js','utf8').replace('__PRECACHE__','[]');
 vm.runInNewContext(source,{self,caches:{open:async()=>cache},URL,Response,Date,AbortSignal});
 const dispatch=async(data)=>{let task;events.push({data:{json:()=>data},waitUntil:p=>task=p});await task;};
 const payload={userId:'owner',title:'Upcoming class',body:'Starts soon',tag:'unique',url:'/#/schedule',expiresAt:new Date(Date.now()+60000).toISOString()};
 await dispatch(payload);assert.equal(shown.length,1);assert.equal(shown[0][1].data.url,'https://herin.test/#/schedule');
 await dispatch({...payload,userId:'other'});await dispatch({...payload,expiresAt:'2000-01-01'});await dispatch({...payload,url:'https://evil.test'});assert.equal(shown.length,1);
 let task;events.message({data:{type:'PUSH_OWNER',userId:null},ports:[{postMessage(){}}],waitUntil:p=>task=p});await task;
 await dispatch(payload);assert.equal(shown.length,1);
 events.notificationclick({notification:{close(){},data:{url:'https://evil.test'}},waitUntil:p=>task=p});await task;assert.deepEqual(opened,['https://herin.test/#/schedule']);
});
