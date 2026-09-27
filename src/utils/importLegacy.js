import {storage} from './storage';
import {cloudRead,cloudWrite,cloudUser,flushCloud,uploadCloudPdf} from './cloudStore';
import {getLegacyPdfBlob} from './db';
export function hasLegacyData(){try{return ['pdfs','classes','assignments'].some(key=>JSON.parse(localStorage.getItem(storage.KEYS[key])||'[]').length);}catch{return false;}}
export async function importLegacyData(){
  const user=cloudUser();if(!user)throw Error('Sign in first.');
  const old={};for(const [key,localKey] of Object.entries(storage.KEYS)){try{old[key]=JSON.parse(localStorage.getItem(localKey)||'null');}catch{}}
  old.study ||= {flashcards:JSON.parse(localStorage.getItem('herin:flashcards')||'[]'),quizQuestions:JSON.parse(localStorage.getItem('herin:quizQuestions')||'[]')};
  for(const pdf of old.pdfs||[]){if(pdf.kind==='note')continue;const file=await getLegacyPdfBlob(pdf.id);if(!file)throw Error(`Original file missing for ${pdf.name}. Your local data has not been removed.`);await uploadCloudPdf(pdf.id,file);if(user!==cloudUser())throw Error('Account changed. Import stopped.');}
  const merge=(local,remote)=>[...local.filter(item=>!remote.some(r=>r.id===item.id)),...remote];
  for(const key of ['classes','pdfs','assignments']) if(old[key]){if(!cloudWrite(key,merge(old[key],cloudRead(key,[]))))throw Error('Not enough device storage to import.');}
  for(const key of ['notes','highlights','extractedTexts','reminders']) if(old[key]){if(!cloudWrite(key,{...old[key],...cloudRead(key,{})}))throw Error('Not enough device storage to import.');}
  const current=cloudRead('study',{flashcards:[],quizQuestions:[]});
  if(old.settings&&!cloudWrite('settings',{...cloudRead('settings',{}),...old.settings}))throw Error('Not enough device storage to import preferences.');
  if(!cloudWrite('study',{flashcards:merge(old.study.flashcards||[],current.flashcards),quizQuestions:merge(old.study.quizQuestions||[],current.quizQuestions)}))throw Error('Not enough device storage to import.');
  await flushCloud();
  // Preserve the legacy copy; reimport is idempotent and never deletes cloud records.
}
