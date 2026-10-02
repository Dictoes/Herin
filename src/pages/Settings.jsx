import SharedLinksManager from '../components/common/SharedLinksManager';
import SupportHerin from '../components/common/SupportHerin';
import { useAuth } from '../context/AuthContext';
import { hasLegacyData, importLegacyData } from '../utils/importLegacy';
import OfflineStatus from '../components/common/OfflineStatus';
import React, { useEffect, useRef, useState } from 'react';
import { Bell, Download, Trash2, ShieldCheck } from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { storage } from '../utils/storage';
import { notificationsSupported, currentPermission } from '../utils/notifications';
import { customThemeError, DEFAULT_CUSTOM_THEME, THEME_PRESETS } from '../utils/themePresets';

import {enableBackgroundPush,disableBackgroundPush,restoreBackgroundPush,backgroundPushSupported,testBackgroundPush} from '../utils/backgroundPush';
import {flushCloud} from '../utils/cloudStore';

const CUSTOM_THEME_VARIABLES = [
  '--bg-primary', '--bg-secondary', '--surface-card', '--surface-raised',
  '--text-primary', '--text-secondary', '--accent-primary', '--accent-secondary',
  '--border-color', '--border-strong', '--paper', '--surface', '--surface-sunken',
  '--ink', '--ink-soft', '--ink-faint', '--border', '--primary', '--primary-dark',
  '--primary-tint', '--focus-color', '--custom-button', '--custom-button-text',
];
const CUSTOM_THEME_FIELDS = [
  ['background', 'Background color'],
  ['surface', 'Card and surface color'],
  ['text', 'Primary text color'],
  ['secondaryText', 'Secondary text color'],
  ['accent', 'Accent color'],
  ['border', 'Border color'],
  ['button', 'Button color'],
];

export default function Settings() {
  const auth = useAuth();
  const [loggingOut,setLoggingOut] = useState(false);
  const [importing,setImporting] = useState(false);
  const { settings, updateSettings, pushToast, clearAllData } = useApp();
  const [permission, setPermission] = useState(currentPermission());
  const [confirmClear, setConfirmClear] = useState(false);
  const [pushEnabled,setPushEnabled]=useState(false),[pushBusy,setPushBusy]=useState(false),[pushError,setPushError]=useState('');
  const [previewTheme, setPreviewTheme] = useState(null);
  const previewSnapshot = useRef(null);
  const customTheme = { ...DEFAULT_CUSTOM_THEME, ...settings.customTheme };
  const customError = customThemeError(customTheme);
  useEffect(()=>{restoreBackgroundPush(auth?.session?.user.id).then(setPushEnabled).catch(()=>{});},[auth?.session?.user.id]);

  function restoreThemePreview() {
    const snapshot = previewSnapshot.current;
    if (!snapshot) return;
    const root = document.documentElement;
    root.dataset.theme = snapshot.theme;
    CUSTOM_THEME_VARIABLES.forEach((name) => {
      if (snapshot.styles[name]) root.style.setProperty(name, snapshot.styles[name]);
      else root.style.removeProperty(name);
    });
    previewSnapshot.current = null;
  }

  useEffect(() => () => restoreThemePreview(), []);

  useEffect(() => {
    setPermission(currentPermission());
  }, [settings.notificationsEnabled]);

  function handleToggleNotifications(checked) {
    updateSettings({notificationsEnabled:checked});
  }
  function previewThemeChoice(theme) {
    const root = document.documentElement;
    if (!previewSnapshot.current) {
      previewSnapshot.current = {
        theme: root.dataset.theme || settings.theme || 'ocean',
        styles: Object.fromEntries(CUSTOM_THEME_VARIABLES.map((name) => [name, root.style.getPropertyValue(name)])),
      };
    }
    CUSTOM_THEME_VARIABLES.forEach((name) => root.style.removeProperty(name));
    root.dataset.theme = theme;
    setPreviewTheme(theme);
  }
  function applyTheme(theme) {
    restoreThemePreview();
    updateSettings({ theme });
    setPreviewTheme(null);
  }
  function updateCustomThemeColor(field, value) {
    const next = { ...customTheme, [field]: value };
    if (customThemeError(next)) {
      pushToast('That color would make text or controls difficult to read. Choose a higher-contrast color.', 'error');
      return;
    }
    updateSettings({ customTheme: next });
  }
  function resetAppearance() {
    restoreThemePreview();
    updateSettings({
      mode: 'system',
      theme: 'ocean',
      customTheme: DEFAULT_CUSTOM_THEME,
      contrast: 'normal',
      warmScreenColors: false,
      fontSize: 'medium',
      layoutDensity: 'comfortable',
      reduceAnimations: false,
      reduceDecorations: false,
      dimBackground: false,
    });
    setPreviewTheme(null);
    pushToast('Appearance settings reset.', 'success');
  }
  async function toggleBackground() {
    setPushBusy(true);setPushError('');
    try {
      if(pushEnabled){await disableBackgroundPush();setPushEnabled(false);}
      else {await enableBackgroundPush(auth.session.user.id);updateSettings({notificationsEnabled:true,permissionAsked:true});await flushCloud();setPushEnabled(true);}
      setPermission(currentPermission());
    }catch(e){setPushError(e.message);}finally{setPushBusy(false);}
  }

  function handleExport() {
    const data = storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Herin-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    pushToast('Export downloaded.', 'success');
  }

  return (
    <AppLayout title="Settings" subtitle="Manage reminders and your data"><section className="card settings-section"><h2>Help & privacy</h2><SupportHerin/><p>Learn how to use Herin and how your information is handled.</p><div className="help-links"><a href="#/guide" target="_blank" rel="noopener noreferrer">User guide</a><a href="#/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a></div></section>
      {auth && <div className="card settings-section"><h2>Account</h2><div className="settings-row"><span>{auth.session?.user.email}</span><button className="btn btn-secondary" disabled={loggingOut} onClick={async()=>{setLoggingOut(true);try{await auth.logout();}catch(e){pushToast(e.message,'error');}finally{setLoggingOut(false);}}}>{loggingOut?'Saving and logging out...':'Log out'}</button></div></div>}
      {auth && <SharedLinksManager/>}{auth && hasLegacyData() && <div className="card settings-section"><h2>Existing data on this device</h2><p>Copy your previous local Herin workspace into this account. Your original local copy will be kept.</p><button className="btn btn-secondary" disabled={importing} onClick={async()=>{setImporting(true);try{await importLegacyData();window.location.reload();}catch(e){pushToast(e.message,'error');setImporting(false);}}}>{importing?'Importing…':'Import local workspace'}</button></div>}
      <div className="card settings-section"><h2>Install & offline access</h2><OfflineStatus details/><p>Enable background reminders below to receive alerts after closing Herin. On iPhone or iPad (iOS 16.4+), add Herin to your Home Screen, open it there, and allow notifications.</p></div>
      <div className="card settings-section" id="appearance">
        <div className="section-title">Appearance & profile</div>
        <div className="settings-row"><div><div className="label">Display name</div><div className="desc">Personalize your account across devices.</div></div><input className="input" aria-label="Display name" style={{maxWidth:220}} value={settings.displayName || ''} onChange={e => updateSettings({displayName:e.target.value})} /></div>
        <div className="settings-row"><div><div className="label">Color mode</div><div className="desc">Choose your reading environment.</div></div><select className="select" aria-label="Color mode" value={settings.mode || 'system'} onChange={e => updateSettings({mode:e.target.value})}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Follow system</option></select></div>
        <div className="theme-gallery-heading">
          <div><div className="label">Study theme</div><div className="desc">Preview a palette, then apply the one that feels comfortable.</div></div>
          {previewTheme && <span className="theme-preview-status" role="status">Previewing {THEME_PRESETS.find((theme) => theme.id === previewTheme)?.label}</span>}
        </div>
        <div className="theme-gallery">
          {THEME_PRESETS.map((theme) => (
            <article className={`theme-card ${settings.theme === theme.id ? 'selected' : ''}`} key={theme.id}>
              <div className="theme-card-swatches" aria-label={`${theme.label} palette preview`}>
                {theme.swatches.map((color) => <span key={color} style={{ backgroundColor: color }} />)}
              </div>
              <strong>{theme.label}</strong>
              <div className="theme-card-actions">
                <button className="btn btn-ghost btn-sm" type="button" aria-label={`Preview ${theme.label}`} onClick={() => previewThemeChoice(theme.id)}>Preview</button>
                <button className="btn btn-secondary btn-sm" type="button" aria-pressed={settings.theme === theme.id} onClick={() => applyTheme(theme.id)}>{settings.theme === theme.id ? 'Applied' : 'Apply'}</button>
              </div>
            </article>
          ))}
        </div>
        {settings.theme === 'custom' && (
          <div className="custom-theme-panel">
            <div className="label">Custom colors</div>
            <p className="desc">Colors are checked for readability before they are saved or applied.</p>
            <div className="custom-theme-colors">
              {CUSTOM_THEME_FIELDS.map(([field, label]) => (
                <label className="custom-color-control" key={field}>
                  <span>{label}</span>
                  <input type="color" value={customTheme[field]} aria-label={label} onChange={(event) => updateCustomThemeColor(field, event.target.value)} />
                </label>
              ))}
            </div>
            {customError && <p className="custom-theme-error" role="alert">{customError}</p>}
          </div>
        )}
        <div className="comfort-settings">
          <div className="label">Reading comfort</div>
          <div className="comfort-controls">
            <label className="comfort-control"><span>Contrast</span><select className="select" aria-label="Contrast preference" value={settings.contrast || 'normal'} onChange={(event) => updateSettings({ contrast: event.target.value })}><option value="soft">Softer contrast</option><option value="normal">Standard</option><option value="high">Higher contrast</option></select></label>
            <label className="comfort-control"><span>Text size</span><select className="select" aria-label="Text size" value={settings.fontSize || 'medium'} onChange={(event) => updateSettings({ fontSize: event.target.value })}><option value="small">Small</option><option value="medium">Default</option><option value="large">Large</option></select></label>
            <label className="comfort-control"><span>Layout density</span><select className="select" aria-label="Layout density" value={settings.layoutDensity || 'comfortable'} onChange={(event) => updateSettings({ layoutDensity: event.target.value })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label>
          </div>
          <div className="comfort-toggles">
            {[
              ['warmScreenColors', 'Warm screen colors'],
              ['reduceAnimations', 'Reduce animations'],
              ['reduceDecorations', 'Reduce decorative elements'],
              ['dimBackground', 'Dim the background'],
            ].map(([setting, label]) => (
              <label className="comfort-toggle" key={setting}>
                <input type="checkbox" checked={Boolean(settings[setting])} onChange={(event) => updateSettings({ [setting]: event.target.checked })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="appearance-footer"><button className="btn btn-ghost" type="button" onClick={resetAppearance}>Reset appearance settings</button></div>
      </div>
      <div className="card settings-section">
        <div className="section-title">
          <Bell size={15} style={{ verticalAlign: -2, marginRight: 6 }} /> Reminders
        </div>

        <div className="settings-row">
          <div>
            <div className="label">Remind me before class or assignment deadline</div>
            <div className="desc">
              Enable class, assignment, and saved reminders for your account. For alerts while Herin is closed, also enable background reminders on each device. Times follow your device time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(e) => handleToggleNotifications(e.target.checked)}
              aria-label="Enable class reminders"
            />
            <span className="track" />
          </label>
        </div>

        <div className="settings-row">
          <div>
            <div className="label">Reminder time</div>
            <div className="desc">How long before a class or assignment deadline you'd like to be notified.</div>
          </div>
          <select
            className="select"
            style={{ width: 140 }}
            value={settings.reminderMinutes}
            onChange={(e) => updateSettings({ reminderMinutes: Number(e.target.value) })}
            aria-label="Minutes before class to remind me"
          >
            {[5, 10, 15, 20, 30].map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <div><div className="label">Background reminders on this device</div><div className="desc">{pushEnabled?'This device is registered. Delivery requires account reminders to be on, an internet connection, and notifications allowed by your device.':'Receive reminders with the Herin tab closed. Your browser or operating system may delay delivery; force-quitting or disabling background activity can stop it.'}</div></div>
          <button className="btn btn-secondary" disabled={pushBusy||!backgroundPushSupported()} onClick={toggleBackground}>{pushBusy?'Updating...':pushEnabled?'Disable on this device':'Enable background reminders'}</button>
        </div>
        {!backgroundPushSupported()&&<p>On iPhone or iPad, open Herin from your Home Screen. Otherwise, use a browser that supports push notifications.</p>}
        {pushError&&<p role="alert">{pushError}</p>}
        {pushEnabled&&<button className="btn btn-secondary" disabled={pushBusy} onClick={async()=>{setPushBusy(true);setPushError('');try{await testBackgroundPush();pushToast('Test sent. Check your device notifications.','success');}catch(e){setPushError(e.message);}finally{setPushBusy(false);}}}>Send test notification</button>}
        {notificationsSupported() && (
          <div className="settings-row">
            <div>
              <div className="label">Browser permission</div>
              <div className="desc">
                {permission === 'granted' && 'Browser notifications are allowed.'}
                {permission === 'denied' && 'Browser notifications are blocked. Enable them in your browser\u2019s site settings to receive pop-up alerts; in-app reminders will still work.'}
                {permission === 'default' && 'You will be asked to allow notifications when you enable background reminders.'}
              </div>
            </div>
            <span className={`badge ${permission === 'granted' ? 'badge-live' : permission === 'denied' ? 'badge-danger' : 'badge-info'}`}>
              {permission === 'granted' ? 'Allowed' : permission === 'denied' ? 'Blocked' : 'Not set'}
            </span>
          </div>
        )}
      </div>

      <div className="card settings-section">
        <div className="section-title">
          <ShieldCheck size={15} style={{ verticalAlign: -2, marginRight: 6 }} /> Your data
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Where your data lives</div>
            <div className="desc">Your study data is saved to your Supabase account. PDF files are stored in a private bucket. This device keeps a cache for offline work.</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Export your data</div>
            <div className="desc">Download schedules, notes, highlights, flashcards, quizzes, and preferences as JSON. Original PDF files are not included; download them separately. This is an export, not an automatic restore backup. Wait for "Saved to Supabase" before clearing browser data.</div>
          </div>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export
          </button>
        </div>
        <div className="settings-row">
          <div>
            <div className="label">Clear all data</div>
            <div className="desc">Permanently delete your schedule, PDFs, notes, and highlights from your account and this device.</div>
          </div>
          <button className="btn btn-danger" onClick={() => setConfirmClear(true)}>
            <Trash2 size={15} /> Clear data
          </button>
        </div>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Clear all data?"
          message="This permanently deletes every class, PDF, note, and highlight from your account and this device. This can't be undone."
          confirmLabel="Clear everything"
          onCancel={() => setConfirmClear(false)}
          onConfirm={async () => {
            try { await clearAllData(); setConfirmClear(false); pushToast('All data cleared.', 'success'); }
            catch { pushToast('Could not clear all data. Please try again.', 'error'); }
          }}
        />
      )}
    </AppLayout>
  );
}
