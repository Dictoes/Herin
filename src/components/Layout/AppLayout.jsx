import OfflineStatus from '../common/OfflineStatus';
import React, { useState } from 'react';
import { Menu, Plus, Sun, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import Sidebar from './Sidebar';
import ToastStack from '../common/ToastStack';

export default function AppLayout({ title, subtitle, actions, children }) {
  const navigate = useNavigate();
  const { settings, updateSettings, addStandaloneNote } = useApp();
  const [quickOpen, setQuickOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      <div className={`sidebar-scrim ${navOpen ? 'show' : ''}`} onClick={() => setNavOpen(false)} />
      <div className="main-area">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img className="mobile-brand" src={`${import.meta.env.BASE_URL}herin-logo.svg`} width="30" height="30" alt="Herin" />
            <button
              className="btn btn-ghost btn-icon menu-btn"
              aria-label="Open navigation menu"
              onClick={() => setNavOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="topbar-title">{title}</h1>
              {subtitle && <div className="topbar-sub">{subtitle}</div>}
            </div>
          </div>
          <div className="topbar-actions">{actions}<button className="btn btn-ghost btn-icon" aria-label="Toggle light and dark mode" onClick={()=>updateSettings({mode: document.documentElement.dataset.mode === 'dark' ? 'light':'dark'})}>{settings.mode === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><div className="quick-add"><button className="btn btn-secondary" aria-expanded={quickOpen} onClick={()=>setQuickOpen(!quickOpen)}><Plus size={16}/><span>Quick add</span></button>{quickOpen && <div className="quick-menu card"><button className="btn btn-ghost" onClick={()=>{navigate('/schedule?add=1');setQuickOpen(false);}}>Add class</button><button className="btn btn-ghost" onClick={()=>{navigate('/pdfs');setQuickOpen(false);}}>Import PDF</button><button className="btn btn-ghost" onClick={()=>{const id=addStandaloneNote();navigate(`/pdfs/${id}?notes=1`);setQuickOpen(false);}}>Write a note</button></div>}</div></div>
        </header>
        <OfflineStatus/><main className="page-content">{children}</main>
      </div>
      <ToastStack />
    </div>
  );
}
