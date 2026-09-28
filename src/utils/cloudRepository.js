// Explicit translation between Herin's UI model and the existing SQL schema.
import { databaseJson } from './databaseText.js';
const tables = ['classes','pdfs','notes','highlights','flashcards','quizzes','assignments','reminders','user_preferences','profiles'];
export async function databaseId(id,userId='') {
  if (!id) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${id}`)));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes.slice(0,16)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const pdfPath = async (userId,id) => `${userId}/${await databaseId(id,userId)}.pdf`;
function check(result) { if (result.error) throw new Error(result.error.message); return result.data; }
export function decodeRows(rows) {
  const model = {classes:[],pdfs:[],notes:{},highlights:{},extractedTexts:{},study:{flashcards:[],quizQuestions:[]},assignments:[],reminders:{},settings:{},quizSession:{},quizzesMeta:rows.quizzes};
  const id = row => row.data?.id || row.id;
  const pdfIds = new Map(rows.pdfs.map(r=>[r.id,id(r)]));
  const classIds = new Map(rows.classes.map(r=>[r.id,id(r)]));
  const hlIds = new Map(rows.highlights.map(r=>[r.id,id(r)]));
  model.classes = rows.classes.map(r=>{let schedule={};try{schedule=JSON.parse(r.schedule_pattern)||{};}catch{}return {days:[],startTime:'09:00',endTime:'10:00',...schedule,...r.data,id:id(r),name:r.name,instructor:r.instructor||'',color:r.data?.color||r.color_code};});
  model.pdfs = rows.pdfs.map(r=>({...r.data,id:id(r),name:r.title,filePath:r.file_path,pageCount:r.page_count,uploadedAt:r.created_at,status:r.data?.status||'ready'}));
  for(const r of rows.pdfs) if(r.extracted_text) model.extractedTexts[id(r)]=r.extracted_text;
  for(const r of rows.notes) {
    const key=pdfIds.get(r.pdf_id)||r.data?.documentId||id(r);
    if(model.notes[key]) { (model.notes[key].additionalRows ||= []).push(r);continue; }
    model.notes[key]={...r.data,additionalRows:[],rowId:r.id,content:r.content,updatedAt:r.updated_at};
    if(!r.pdf_id) {model.pdfs.push({...r.data,id:key,name:r.data?.name||'Untitled note',kind:'note',status:'ready',uploadedAt:r.created_at});model.highlights[key]=r.data?.standaloneHighlights||[];}
  }
  for(const r of rows.highlights) {
    const key=pdfIds.get(r.pdf_id)||r.pdf_id;
    (model.highlights[key] ||= []).push({source:'pdf',...r.data,id:id(r),text:r.highlighted_text,color:r.color_code,page:r.page_number,rects:Array.isArray(r.bounding_box)?r.bounding_box:r.bounding_box?.rects||[]});
  }
  model.study.flashcards=rows.flashcards.map(r=>{const hl=rows.highlights.find(h=>h.id===r.highlight_id);return {pdfId:pdfIds.get(hl?.pdf_id),sourcePage:hl?.page_number,sourceText:hl?.highlighted_text,...r.data,id:id(r),highlightId:hlIds.get(r.highlight_id)||r.highlight_id||r.data?.highlightId,question:r.question,answer:r.answer,dueAt:r.next_review_at||r.data?.dueAt};});
  model.study.quizQuestions=rows.quizzes.flatMap(r=>r.questions.map(q=>({...q,cloudQuizId:r.id,pdfId:pdfIds.get(r.pdf_id)||r.pdf_id})));
  model.assignments=rows.assignments.map(r=>({...r.data,id:id(r),title:r.title,description:r.description||'',classId:classIds.get(r.class_id)||'',due:r.data?.due||r.due_date,completed:r.status==='completed'}));
  for(const r of rows.reminders) model.reminders[r.data?.key||r.id]={...r.data,id:r.id,title:r.title,remindAt:r.remind_at,completed:r.is_completed,entityType:r.related_entity_type,entityId:r.related_entity_id};
  const pref=rows.user_preferences[0];
  model.settings={...pref?.data?.settings,mode:pref?.theme||'system',notificationsEnabled:pref?.push_notifications??false,displayName:rows.profiles[0]?.display_name||''};
  model.quizSession=pref?.data?.quizSession||{};
  return model;
}
export async function encodeRows(model,userId) {
  const rows=Object.fromEntries(tables.map(t=>[t,[]]));
  const scopedId=id=>databaseId(id,userId);
  const base=async (item)=>({id:await scopedId(item.id),user_id:userId,data:item});
  for(const c of model.classes||[]) rows.classes.push({...await base(c),name:c.name,instructor:c.instructor||null,schedule_pattern:JSON.stringify({days:c.days,startTime:c.startTime,endTime:c.endTime}),color_code:c.color||null});
  for(const p of model.pdfs||[]) {
    if(p.kind==='note') continue;
    rows.pdfs.push({...await base(p),title:p.name,file_path:p.filePath||await pdfPath(userId,p.id),page_count:p.pageCount||null,extracted_text:model.extractedTexts?.[p.id]||null});
  }
  for(const p of model.pdfs||[]) {
    const n=model.notes?.[p.id]; if(!n && p.kind!=='note') continue;
    const {additionalRows,...noteData}=n||{};
    rows.notes.push({id:await scopedId(n?.rowId||`note:${p.id}`),user_id:userId,pdf_id:p.kind==='note'?null:await scopedId(p.id),content:n?.content||'',data:{...noteData,...(p.kind==='note'?{...p,standaloneHighlights:model.highlights?.[p.id]||[]}:{}),documentId:p.id}});
    for(const row of n?.additionalRows||[]) rows.notes.push(row);
  }
  for(const [pdfId,items] of Object.entries(model.highlights||{})) {if(model.pdfs?.find(p=>p.id===pdfId)?.kind==='note')continue;for(const h of items) rows.highlights.push({...await base(h),pdf_id:await scopedId(pdfId),highlighted_text:h.text||'',color_code:h.color||'yellow',page_number:h.page||null,bounding_box:h.rects||[]});}
  const highlightIds=new Set(Object.values(model.highlights||{}).flat().map(h=>h.id));
  for(const c of model.study?.flashcards||[]) rows.flashcards.push({...await base(c),highlight_id:highlightIds.has(c.highlightId)?await scopedId(c.highlightId):null,question:c.question,answer:c.answer,next_review_at:c.dueAt||null});
  const grouped={}; for(const q of model.study?.quizQuestions||[]) (grouped[q.cloudQuizId||`quiz:${q.pdfId}`] ||= []).push(q);
  for(const [key,questions] of Object.entries(grouped)) rows.quizzes.push({id:await scopedId(key),user_id:userId,pdf_id:await scopedId(questions[0].pdfId),title:model.quizzesMeta?.find(r=>r.id===key)?.title||'Study questions',questions,total_questions:questions.length});
  for(const row of model.quizzesMeta||[]) if(!row.questions.length && (model.pdfs||[]).some(p=>p.id===row.pdf_id)) rows.quizzes.push(row);
  for(const a of model.assignments||[]) rows.assignments.push({...await base(a),class_id:await scopedId(a.classId),title:a.title,description:a.description||null,due_date:new Date(a.due).toISOString(),status:a.completed?'completed':'pending'});
  for(const [key,r] of Object.entries(model.reminders||{})) rows.reminders.push({id:await scopedId(r.id||key),user_id:userId,title:r.title||'Class reminder',remind_at:r.remindAt,is_completed:!!r.completed,related_entity_type:r.entityType||'class',related_entity_id:await scopedId(r.entityId),data:{...r,key}});
  rows.user_preferences.push({user_id:userId,theme:model.settings?.mode||'system',push_notifications:!!model.settings?.notificationsEnabled,data:{settings:model.settings||{},quizSession:model.quizSession||{}}});
  rows.profiles.push({user_id:userId,display_name:model.settings?.displayName||''});
  return databaseJson(rows);
}
export function createRepository(client,userId) {
  let previous;
  return {
    async load() {
      const pairs=await Promise.all(tables.map(async t=>{
        const all=[];for(let offset=0;;offset+=1000){const page=check(await client.from(t).select('*').eq('user_id',userId).order('created_at').order('id').range(offset,offset+999));all.push(...page);if(page.length<1000)break;}return [t,all];
      }));
      const rows=Object.fromEntries(pairs);
      // Fail early if the additive migration has not been applied.
      check(await client.from('pdfs').select('data,extracted_text').limit(0));
      previous=await encodeRows(decodeRows(rows),userId);
      return decodeRows(rows);
    },
    async save(model) {
      const next=await encodeRows(model,userId);
      for(const t of tables) {
        const old=new Map((previous?.[t]||[]).map(r=>[r.id||r.user_id,r]));
        const changed=next[t].filter(r=>JSON.stringify(r)!==JSON.stringify(old.get(r.id||r.user_id)));
        for(let offset=0;offset<changed.length;offset+=200) check(await client.from(t).upsert(changed.slice(offset,offset+200),{onConflict:['profiles','user_preferences'].includes(t)?'user_id':'id'}).select('user_id'));
      }
      // Children first, and delete only IDs present in this loaded workspace.
      for(const t of ['flashcards','quizzes','highlights','notes','assignments','reminders','pdfs','classes']) {
        const ids=new Set(next[t].map(r=>r.id));
        const removed=(previous?.[t]||[]).filter(r=>!ids.has(r.id)).map(r=>r.id);
        for(let offset=0;offset<removed.length;offset+=100) check(await client.from(t).delete().eq('user_id',userId).in('id',removed.slice(offset,offset+100)));
      }
      previous=next;
    },
    async upload(id,file) {const path=await pdfPath(userId,id);check(await client.storage.from('herin-pdfs').upload(path,file,{contentType:'application/pdf',upsert:true}));return path;},
    async download(id,path) {return check(await client.storage.from('herin-pdfs').download(path||await pdfPath(userId,id)));},
    async remove(id,path) {check(await client.storage.from('herin-pdfs').remove([path||await pdfPath(userId,id)]));},
  };
}
