import React,{useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {BookOpen,Link2Off} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {validShareId} from '../utils/studyShare';
import SharedStudyContent from '../components/common/SharedStudyContent';
import '../styles/info.css';
export default function SharedStudy(){
 const {shareId}=useParams();const [result,setResult]=useState({loading:true}),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;setResult({loading:true});
  const robots=document.createElement('meta');robots.name='robots';robots.content='noindex, nofollow';document.head.append(robots);
  async function load(){
   if(!validShareId(shareId)){setResult({missing:true});return;}
   try{
    if(!supabase)throw Error();
    const {data,error}=await supabase.rpc('get_shared_study',{p_share_id:shareId});
    if(error)throw error;
    if(active)setResult(data?.[0]?{study:data[0]}:{missing:true});
   }catch{if(active)setResult({error:true});}
  }
  load();return()=>{active=false;robots.remove();};
 },[shareId,retry]);
 useEffect(()=>{document.title=result.study?`${result.study.title} · Shared on Herin`:'Shared study · Herin';return()=>{document.title='Herin';};},[result]);
 return <div className="info-shell"><header className="info-header"><Link to="/" className="info-brand"><img src={`${import.meta.env.BASE_URL}herin-logo.svg`} width="36" height="36" alt=""/>Herin</Link><Link to="/" className="btn btn-secondary">My workspace</Link></header><main className="info-main shared-page">
 {result.loading?<p role="status">Loading shared study…</p>:result.missing?<section className="card shared-unavailable"><Link2Off size={32} aria-hidden="true"/><h1>This study link is no longer available.</h1><p>It may have been removed, stopped, or expired. Ask the sender for a new link.</p><Link className="btn btn-primary" to="/">Open Herin</Link></section>:result.error?<section className="card"><h1>Could not load this study link</h1><p>Check your connection and try again.</p><button className="btn btn-primary" onClick={()=>setRetry(v=>v+1)}>Retry</button></section>:<><div className="info-intro"><span className="info-emblem"><BookOpen size={26} aria-hidden="true"/></span><p className="shared-kicker">Shared study · Read-only snapshot</p><h1>{result.study.title}</h1>{result.study.subject&&<p>{result.study.subject}</p>}<small>Shared <time dateTime={result.study.created_at}>{new Date(result.study.created_at).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})}</time></small></div><SharedStudyContent snapshot={result.study.content_snapshot}/><p className="share-caption">This is the version shared on the date above. Changes to the original do not update this snapshot. Check study answers against your lesson source.</p></>}
 <footer className="info-footer"><Link to="/guide">How to use Herin</Link><Link to="/privacy">Privacy policy</Link></footer></main></div>;
}
