import OfflineStatus from '../common/OfflineStatus';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Menu, Moon, Palette, Plus, Settings as SettingsIcon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import ProfileAvatar from '../common/ProfileAvatar';
import { THEME_PRESETS } from '../../utils/themePresets';
import Sidebar from './Sidebar';
import ToastStack from '../common/ToastStack';

export default function AppLayout({ title, subtitle, actions, children }) {
  const navigate = useNavigate();
  const { settings, updateSettings, addStandaloneNote } = useApp();
  const [quickOpen, setQuickOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeMenuPosition, setThemeMenuPosition] = useState(null);
  const themeMenuRef = useRef(null);

  useLayoutEffect(() => {
    if (!themeOpen) {
      setThemeMenuPosition(null);
      return undefined;
    }

    function positionMenu() {
      const container = themeMenuRef.current;
      const menu = container?.querySelector('#theme-chooser');
      if (!container || !menu || window.innerWidth > 780) {
        setThemeMenuPosition(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const minLeft = 14;
      const maxLeft = window.innerWidth - menuRect.width - 14;
      const left = Math.max(minLeft, Math.min(menuRect.left, maxLeft));
      setThemeMenuPosition({
        left: `${left - containerRect.left}px`,
        right: 'auto',
      });
    }

    positionMenu();
    window.addEventListener('resize', positionMenu);
    return () => window.removeEventListener('resize', positionMenu);
  }, [themeOpen]);

  useEffect(() => {
    if (!themeOpen) return undefined;
    function closeOnOutsideClick(event) {
      if (!themeMenuRef.current?.contains(event.target)) setThemeOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setThemeOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [themeOpen]);

  return (
    <div className="app-shell">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      <div className={`sidebar-scrim ${navOpen ? 'show' : ''}`} onClick={() => setNavOpen(false)} />
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-heading">
            <img className="mobile-brand" src={`${import.meta.env.BASE_URL}herin-logo.svg`} width="30" height="30" alt="Herin" />
            <button
              className="btn btn-ghost btn-icon menu-btn"
              aria-label="Open navigation menu"
              aria-expanded={navOpen}
              aria-controls="main-navigation"
              onClick={() => setNavOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="topbar-title">{title}</h1>
              {subtitle && <div className="topbar-sub">{subtitle}</div>}
            </div>
          </div>
          <div className="topbar-actions">
            {actions}
            <div className="theme-switcher" ref={themeMenuRef}>
              <button
                className="btn btn-secondary theme-switcher-trigger"
                aria-label={`Choose theme. Current theme: ${THEME_PRESETS.find((item) => item.id === settings.theme)?.label || 'Ocean'}`}
                aria-expanded={themeOpen}
                aria-controls="theme-chooser"
                onClick={() => setThemeOpen((open) => !open)}
              >
                <Palette size={16} />
                <span>Theme</span>
              </button>
              {themeOpen && (
                <div className="theme-menu card" id="theme-chooser" aria-label="Choose a theme" style={themeMenuPosition || undefined}>
                  <div className="theme-menu-heading">Choose a study theme</div>
                  {THEME_PRESETS.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className="theme-menu-option"
                      aria-pressed={settings.theme === theme.id}
                      onClick={() => {
                        updateSettings({ theme: theme.id });
                        setThemeOpen(false);
                      }}
                    >
                      <span className="theme-menu-swatches" aria-hidden="true">
                        {theme.swatches.slice(0, 3).map((color) => <span key={color} style={{ backgroundColor: color }} />)}
                      </span>
                      <span>{theme.label}</span>
                      {settings.theme === theme.id && <Check size={16} aria-label="Selected" />}
                    </button>
                  ))}
                  <button className="theme-menu-settings" type="button" onClick={() => { navigate('/settings'); setThemeOpen(false); }}>
                    <SettingsIcon size={15} /> Comfort & appearance settings
                  </button>
                </div>
              )}
            </div>
            <button className="btn btn-ghost btn-icon" aria-label="Toggle light and dark mode" onClick={()=>updateSettings({mode: document.documentElement.dataset.mode === 'dark' ? 'light':'dark'})}>{settings.mode === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
            <div className="quick-add"><button className="btn btn-secondary" aria-expanded={quickOpen} onClick={()=>setQuickOpen(!quickOpen)}><Plus size={16}/><span>Quick add</span></button>{quickOpen && <div className="quick-menu card"><button className="btn btn-ghost" onClick={()=>{navigate('/schedule?add=1');setQuickOpen(false);}}>Add class</button><button className="btn btn-ghost" onClick={()=>{navigate('/pdfs');setQuickOpen(false);}}>Import PDF</button><button className="btn btn-ghost" onClick={()=>{const id=addStandaloneNote();navigate(`/pdfs/${id}?notes=1`);setQuickOpen(false);}}>Write a note</button></div>}</div>
            <button className="profile-avatar-trigger" type="button" aria-label="Open profile picture settings" title="Profile picture settings" onClick={() => navigate('/settings#appearance')}>
              <ProfileAvatar displayName={settings.displayName} />
            </button>
          </div>
        </header>
        <OfflineStatus/><main className="page-content">{children}</main>
      </div>
      <ToastStack />
    </div>
  );
}
