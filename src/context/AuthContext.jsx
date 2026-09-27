import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {openCloud,closeCloud,flushCloud} from '../utils/cloudStore';
const AuthContext=createContext(null);
export const useAuth=()=>useContext(AuthContext);
export default function AuthProvider({children}) {
  const [session,setSession]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const version=useRef(0);
  useEffect(()=>{
    if(!supabase){setError('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart Herin.');return;}
    let userId;
    const {data}=supabase.auth.onAuthStateChange((_event,next)=>{
      setSession(next);
      if(userId===next?.user.id)return;
      userId=next?.user.id;const request=++version.current;setReady(false);setError('');closeCloud();
      if(!next){setReady(true);return;}
      // Keep the auth callback synchronous; perform database work outside it.
      setTimeout(()=>{if(request!==version.current)return;openCloud(supabase,next.user.id).then(ok=>{if(request===version.current)setReady(ok);}).catch(e=>{if(request===version.current)setError(e.message);});},0);
    });
    // INITIAL_SESSION can contain null, which must still release the loading screen.
    supabase.auth.getSession().then(({data,error})=>{if(error)setError(error.message);else if(!data.session)setReady(true);});
    return()=>{version.current++;data.subscription.unsubscribe();closeCloud();};
  },[retry]);
  async function logout() {await flushCloud();const {error}=await supabase.auth.signOut();if(error)throw error;closeCloud();setSession(null);setReady(true);}
  return <AuthContext.Provider value={{session,logout}}>
    {error?<main className="auth-shell"><section className="card auth-card"><h1>Workspace unavailable</h1><p role="alert">{error}</p><p>Check your connection and ensure the Herin database migration has been applied.</p><button className="btn btn-primary" onClick={()=>setRetry(n=>n+1)}>Retry</button>{session&&<button className="btn btn-secondary" onClick={()=>supabase.auth.signOut().then(({error})=>{if(error)setError(error.message);else{setError('');setSession(null);setReady(true);}})}>Log out</button>}</section></main>:!ready?<main className="auth-shell" role="status">Loading your workspace…</main>:session?<React.Fragment key={session.user.id}>{children}</React.Fragment>:<AuthForm/>}
  </AuthContext.Provider>;
}
function AuthForm(){
  const [signup,setSignup]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  async function submit(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{
    const result=signup?await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+window.location.pathname}}):await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(result.error)throw result.error;
    if(signup&&!result.data.session)setMessage('Check your email to confirm your account, then log in.');
  }catch(e){setError(e.message);}finally{setBusy(false);}}
  return <main className="auth-shell"><section className="card auth-card"><img src={`${import.meta.env.BASE_URL}herin-logo.svg`} alt="" width="48" height="48"/><h1>{signup?'Create your Herin account':'Welcome to Herin'}</h1><p>Your study workspace, saved across devices.</p><form onSubmit={submit}><div className="field"><label htmlFor="auth-email">Email</label><input id="auth-email" className="input" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label htmlFor="auth-password">Password</label><input id="auth-password" className="input" type="password" autoComplete={signup?'new-password':'current-password'} minLength={signup?8:undefined} required value={password} onChange={e=>setPassword(e.target.value)}/></div>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}<button className="btn btn-primary" disabled={busy}>{busy?'Please wait…':signup?'Sign up':'Log in'}</button></form><button className="btn btn-ghost" disabled={busy} onClick={()=>{setSignup(!signup);setError('');setMessage('');}}>{signup?'Already have an account? Log in':'Create an account'}</button></section></main>;
}
