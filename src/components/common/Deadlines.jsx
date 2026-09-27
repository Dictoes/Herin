import React,{useState} from 'react';
import {Plus,Pencil,Trash2} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
export default function Deadlines(){
 const {assignments,saveAssignment,deleteAssignment,classes}=useApp();
 const [edit,setEdit]=useState(null),[remove,setRemove]=useState(null);
 const items=[...assignments].sort((a,b)=>Number(a.completed)-Number(b.completed)||a.due.localeCompare(b.due));
 return <section className="card deadline-card"><div className="section-heading"><h2>Assignments & deadlines</h2><button className="btn btn-secondary" onClick={()=>setEdit({title:'',due:'',classId:'',completed:false})}><Plus size={16}/>Add deadline</button></div>
 {!items.length&&<p className="field-hint">Add an assignment and link it to a class to keep your next deadline in view.</p>}
 {items.map(item=><div className="deadline-row" key={item.id}><input type="checkbox" aria-label={`Complete ${item.title}`} checked={item.completed} onChange={e=>saveAssignment({...item,completed:e.target.checked})}/><div><strong>{item.title}</strong><p>{new Date(item.due).toLocaleString()} · {classes.find(c=>c.id===item.classId)?.name||'No class'}</p><span className={`badge ${item.completed?'badge-live':new Date(item.due)<new Date()?'badge-danger':'badge-info'}`}>{item.completed?'Completed':new Date(item.due)<new Date()?'Overdue':'Upcoming'}</span></div><button className="btn btn-ghost btn-icon" aria-label={`Edit ${item.title}`} onClick={()=>setEdit(item)}><Pencil size={16}/></button><button className="btn btn-ghost btn-icon" aria-label={`Delete ${item.title}`} onClick={()=>setRemove(item)}><Trash2 size={16}/></button></div>)}
 {edit&&<Modal title={edit.id?'Edit deadline':'Add deadline'} onClose={()=>setEdit(null)}><form onSubmit={e=>{e.preventDefault();if(saveAssignment({...edit,title:edit.title.trim()}))setEdit(null);}}><div className="field"><label htmlFor="deadline-title">Assignment</label><input id="deadline-title" className="input" required value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/></div><div className="field"><label htmlFor="deadline-due">Due date and time</label><input id="deadline-due" type="datetime-local" className="input" required value={edit.due} onChange={e=>setEdit({...edit,due:e.target.value})}/></div><div className="field"><label htmlFor="deadline-class">Class</label><select id="deadline-class" className="select" value={edit.classId} onChange={e=>setEdit({...edit,classId:e.target.value})}><option value="">No class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><button className="btn btn-primary" disabled={!edit.title.trim()||!edit.due}>Save deadline</button></form></Modal>}
 {remove&&<ConfirmDialog title="Delete assignment?" message={`Delete ${remove.title}?`} onCancel={()=>setRemove(null)} onConfirm={()=>{if(deleteAssignment(remove.id))setRemove(null);}}/>}
 </section>;
}
