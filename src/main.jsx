import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/study.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
 window.addEventListener('load',()=>navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{updateViaCache:'none'}).then(registration=>{
   if(!registration)return;
   const check=()=>{if(navigator.onLine)registration.update().catch(()=>{});};
   window.addEventListener('focus',check);window.addEventListener('online',check);
   setInterval(check,60000);
 }).catch(()=>window.dispatchEvent(new CustomEvent('herin-offline-error',{detail:'Offline preparation failed. Reconnect and reload.'}))));
}
