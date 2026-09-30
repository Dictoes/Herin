import {databaseJson} from './databaseText.js';
// Explicit allowlist: never spread workspace objects into a public payload.
const text = value => typeof value === 'string' ? value : '';
const studyItem = item => ({question:text(item.question),answer:text(item.answer ?? item.correctAnswer),explanation:text(item.explanation),options:Array.isArray(item.options)?item.options.filter(v=>typeof v==='string'):[]});
export function studySnapshot({content='',flashcards=[],quizzes=[]}) {
 const result=databaseJson({text:text(content),flashcards:flashcards.map(studyItem),quizzes:quizzes.map(studyItem)});
 if(!result.text.trim()&&!result.flashcards.length&&!result.quizzes.length)throw Error('There is no study content to share.');
 if(new TextEncoder().encode(JSON.stringify(result)).length>950000)throw Error('This selection is too large. Share a shorter note or individual study item.');
 return result;
}
export function studyShareUrl(id) {const url=new URL(import.meta.env.BASE_URL,window.location.href);url.search='';url.hash=`/share/${id}`;return url.href;}
export const validShareId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');
