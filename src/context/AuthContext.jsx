import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {ArrowRight, BookOpen, BrainCircuit, Eye, EyeOff, FileText, LockKeyhole, ShieldCheck, Sparkles} from 'lucide-react';
import {Link} from 'react-router-dom';
import {supabase} from '../lib/supabase';
import {openCloud,closeCloud,flushCloud} from '../utils/cloudStore';
import {disableBackgroundPush,restoreBackgroundPush,clearPushOwner} from '../utils/backgroundPush';
import {PROFILE_PHOTO_BUCKET,validateProfilePhoto} from '../utils/profilePhoto';
const AuthContext=createContext(null);
export const useAuth=()=>useContext(AuthContext);
export default function AuthProvider({children}) {
  const [session,setSession]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [passwordRecovery,setPasswordRecovery]=useState(false);
  const [retry,setRetry]=useState(0);
  const version=useRef(0);
  useEffect(()=>{
    if(session?.user.id)restoreBackgroundPush(session.user.id).catch(()=>{});
    else clearPushOwner().catch(()=>{});
  },[session?.user.id]);
  useEffect(()=>{
    if(!supabase){setError('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart Herin.');return;}
    let userId;
    const {data}=supabase.auth.onAuthStateChange((event,next)=>{
      if(event==='PASSWORD_RECOVERY')setPasswordRecovery(true);
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
  async function updateProfilePhoto(file) {
    if (!session?.user) throw Error('Sign in to update your profile picture.');
    validateProfilePhoto(file);
    const path=`${session.user.id}/avatar`;
    const {error:uploadError}=await supabase.storage.from(PROFILE_PHOTO_BUCKET).upload(path,file,{cacheControl:'3600',contentType:file.type,upsert:true});
    if(uploadError)throw uploadError;
    const {data,error:updateError}=await supabase.auth.updateUser({data:{...session.user.user_metadata,avatar_path:path}});
    if(updateError)throw updateError;
    setSession(current=>current?{...current,user:data.user}:current);
  }
  async function logout() {await flushCloud();await disableBackgroundPush();const {error}=await supabase.auth.signOut();if(error)throw error;closeCloud();setSession(null);setReady(true);}
  return <AuthContext.Provider value={{session,logout,updateProfilePhoto}}>
    {error?<main className="auth-shell"><section className="card auth-card"><h1>Workspace unavailable</h1><p role="alert">{error}</p><p>Check your connection and ensure the Herin database migration has been applied.</p><button className="btn btn-primary" onClick={()=>setRetry(n=>n+1)}>Retry</button>{session&&<button className="btn btn-secondary" onClick={()=>logout().then(()=>setError('')).catch(e=>setError(e.message))}>Log out</button>}</section></main>:passwordRecovery?<AuthForm recovery onRecoveryComplete={()=>setPasswordRecovery(false)}/>:!ready?<main className="auth-shell" role="status">Loading your workspace…</main>:session?<React.Fragment key={session.user.id}>{children}</React.Fragment>:<AuthForm/>}
  </AuthContext.Provider>;
}
function AuthForm({recovery=false,onRecoveryComplete=()=>{}}){
  const [signup,setSignup]=useState(false),[forgot,setForgot]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[acceptedTerms,setAcceptedTerms]=useState(false),[showPassword,setShowPassword]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  async function submit(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{
    if(recovery){
      if(password!==confirmPassword)throw Error('Your passwords do not match.');
      const {error:resultError}=await supabase.auth.updateUser({password});
      if(resultError)throw resultError;
      onRecoveryComplete();
      return;
    }
    if(forgot){
      const {error:resultError}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+window.location.pathname});
      if(resultError)throw resultError;
      setMessage('Check your inbox for a password reset link.');
      return;
    }
    const result=signup?await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+window.location.pathname}}):await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(result.error)throw result.error;
    if(signup&&!result.data.session)setMessage('Check your email to confirm your account, then log in.');
  }catch(e){setError(e.message);}finally{setBusy(false);}}
  const heading=recovery?'Choose a new password':forgot?'Reset your password':signup?'Create your account':'Welcome back';
  const description=recovery?'Create a new password for your Herin account.':forgot?'Enter your email and we’ll send you a reset link.':signup?'Start organizing your study space in one place.':'Sign in to continue to your study workspace.';
  return <main className="auth-shell">
    <header className="auth-header">
      <Link to="/" className="auth-brand"><img src={`${import.meta.env.BASE_URL}herin-logo.svg`} alt="" width="40" height="40"/><span>Herin<small>Your learning space</small></span></Link>
      <nav aria-label="Help and information"><Link to="/guide">User guide</Link><Link to="/privacy">Privacy</Link></nav>
    </header>
    <div className="auth-content">
      <section className="auth-story" aria-labelledby="auth-story-title">
        <span className="auth-eyebrow"><Sparkles size={15} aria-hidden="true"/>A calmer way to study</span>
        <h1 id="auth-story-title">Make every study session count.</h1>
        <p className="auth-story-copy">Your PDFs, notes, and practice materials together in a workspace built to help you learn with confidence.</p>
        <div className="auth-features">
          <article className="auth-feature"><span><FileText size={20} aria-hidden="true"/></span><div><h2>Keep it organized</h2><p>Bring your PDFs, notes, and highlights together.</p></div></article>
          <article className="auth-feature"><span><BrainCircuit size={20} aria-hidden="true"/></span><div><h2>Study actively</h2><p>Turn lesson content into flashcards and quizzes.</p></div></article>
          <article className="auth-feature"><span><BookOpen size={20} aria-hidden="true"/></span><div><h2>Learn at your pace</h2><p>Review your materials across your devices.</p></div></article>
          <article className="auth-feature"><span><ShieldCheck size={20} aria-hidden="true"/></span><div><h2>Your own workspace</h2><p>Sign in to access your saved study materials.</p></div></article>
        </div>
        <div className="auth-note"><ShieldCheck size={19} aria-hidden="true"/><p><strong>Made for focused learning.</strong><br/>Your study space, ready when you are.</p></div>
      </section>
      <section className="card auth-card" aria-labelledby="auth-title">
        <span className="auth-card-icon"><LockKeyhole size={22} aria-hidden="true"/></span>
        <h2 id="auth-title">{heading}</h2>
        <p className="auth-card-description">{description}</p>
        <form onSubmit={submit}>
          {!recovery&&<div className="field"><label htmlFor="auth-email">Email</label><div className="auth-input-wrap"><span aria-hidden="true">@</span><input id="auth-email" className="input" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div></div>}
          {!forgot&&<div className="field"><label htmlFor="auth-password">{recovery?'New password':'Password'}</label><div className="auth-input-wrap"><LockKeyhole size={17} aria-hidden="true"/><input id="auth-password" className="input" type={showPassword?'text':'password'} autoComplete={recovery||signup?'new-password':'current-password'} minLength={recovery||signup?8:undefined} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={recovery||signup?'At least 8 characters':'Enter your password'}/><button className="auth-password-toggle" type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></div>}
          {recovery&&<div className="field"><label htmlFor="auth-confirm-password">Confirm new password</label><div className="auth-input-wrap"><LockKeyhole size={17} aria-hidden="true"/><input id="auth-confirm-password" className="input" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter your new password"/></div></div>}
          {signup&&<label className="auth-terms"><input type="checkbox" checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)} required/><span>I agree to the <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms of Use</Link> and acknowledge the <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.</span></label>}
          {!signup&&!forgot&&!recovery&&<div className="auth-form-options"><span aria-hidden="true"></span><button type="button" className="auth-text-button" onClick={()=>{setForgot(true);setError('');setMessage('');}}>Forgot password?</button></div>}
          {error&&<p className="auth-feedback auth-error" role="alert">{error}</p>}{message&&<p className="auth-feedback auth-message" role="status">{message}</p>}
          <button className="btn btn-primary auth-submit" disabled={busy}>{busy?'Please wait…':recovery?'Update password':forgot?'Send reset link':signup?'Sign up':'Log in'}<ArrowRight size={17} aria-hidden="true"/></button>
        </form>
        {!recovery&&<div className="auth-switch">{forgot?<button className="auth-text-button" disabled={busy} onClick={()=>{setForgot(false);setError('');setMessage('');}}>Back to log in</button>:<><span>{signup?'Already have an account?':'New to Herin?'}</span><button className="auth-text-button" disabled={busy} onClick={()=>{setSignup(!signup);setForgot(false);setAcceptedTerms(false);setError('');setMessage('');}}>{signup?'Log in':'Create an account'}</button></>}</div>}
        <p className="auth-help">Need a hand? <Link to="/guide">Visit the user guide</Link></p>
      </section>
    </div>
    <footer className="auth-footer"><span>© {new Date().getFullYear()} Herin · Your learning space</span><nav aria-label="Legal"><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms of Use</Link><a href="mailto:johnbenedictbucao2@gmail.com">Contact</a></nav></footer>
  </main>;
}
