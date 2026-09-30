import React,{useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {studyShareUrl} from '../../utils/studyShare';
import {useApp} from '../../context/AppContext';
export default function SharedLinksManager(){
 const [links,setLinks]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(''),[retry,setRetry]=useState(0);
 const {pushToast}=useApp();
 useEffect(()=>{let active=true;setLoading(true);setError('');supabase.from('shared_study_links').select('share_id,title,created_at,is_public').eq('is_public',true).order('created_at',{ascending:false}).limit(100).then(({data,error})=>{if(!active)return;setLoading(false);if(error)setError('Your shared links could not load.');else setLinks(data||[]);});return()=>{active=false;};},[retry]);
 async function stop(id){setBusy(id);setError('');try{const {error}=await supabase.rpc('revoke_study_share',{p_share_id:id});if(error)throw error;setLinks(rows=>rows.filter(r=>r.share_id!==id));pushToast('Study link disabled.','success');}catch{setError('Could not stop sharing. Please retry.');}finally{setBusy('');}}
 return <section className="card settings-section"><h2>Shared study links</h2><p>Anyone with a link can read its snapshot. Stop sharing to disable access. Copies already saved by recipients cannot be recalled.</p>{loading&&<p role="status">Loading links…</p>}{!loading&&!error&&!links.length&&<p>No active shared links. Use Share on a lesson, flashcard, or quiz question.</p>}{error&&<p role="alert">{error} <button className="btn btn-ghost" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}{links.map(link=><div className="shared-link-row" key={link.share_id}><div><a href={studyShareUrl(link.share_id)} target="_blank" rel="noopener noreferrer">{link.title}</a><small>{new Date(link.created_at).toLocaleDateString()}</small></div><button className="btn btn-secondary" disabled={!!busy} onClick={()=>stop(link.share_id)}>{busy===link.share_id?'Stopping…':'Stop sharing'}</button></div>)}{links.length===100&&<p>Showing the latest 100 active links.</p>}</section>;
}
