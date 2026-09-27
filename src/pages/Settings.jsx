import { useAuth } from '../context/AuthContext';
import { hasLegacyData, importLegacyData } from '../utils/importLegacy';
import OfflineStatus from '../components/common/OfflineStatus';
import React, { useEffect, useState } from 'react';
import { Bell, Download, Trash2, ShieldCheck } from 'lucide-react';
import AppLayout from '../components/Layout/AppLayout';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { storage } from '../utils/storage';
import { notificationsSupported, currentPermission, requestPermission } from '../utils/notifications';

export default function Settings() {
  const auth = useAuth();
  const [loggingOut,setLoggingOut] = useState(false);
  const [importing,setImporting] = useState(false);
  const { settings, updateSettings, pushToast, clearAllData } = useApp();
  const [permission, setPermission] = useState(currentPermission());
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setPermission(currentPermission());
  }, [settings.notificationsEnabled]);

  async function handleToggleNotifications(checked) {
    if (!checked) {
      updateSettings({ notificationsEnabled: false });
      return;
    }
    if (!notificationsSupported()) {
      updateSettings({ notificationsEnabled: true, permissionAsked: true });
      pushToast('Background notifications require a notification server. In-app reminders work while Herin is open.', 'info');
      return;
    }
    if (Notification.permission === 'granted') {
      updateSettings({ notificationsEnabled: true });
      pushToast('Background notifications require a notification server. In-app reminders work while Herin is open.', 'info');
      return;
    }
    const result = await requestPermission();
    setPermission(result);
    updateSettings({ notificationsEnabled: true, permissionAsked: true });
    if (result === 'granted') {
      pushToast('Background notifications require a notification server. In-app reminders work while Herin is open.', 'info');
    } else {
      pushToast('Browser notifications were declined  you’ll still see in-app reminders.', 'info');
    }
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
    <AppLayout title="Settings" subtitle="Manage reminders and your data">
      {auth && <div className="card settings-section"><h2>Account</h2><div className="settings-row"><span>{auth.session?.user.email}</span><button className="btn btn-secondary" disabled={loggingOut} onClick={async()=>{setLoggingOut(true);try{await auth.logout();}catch(e){pushToast(e.message,'error');}finally{setLoggingOut(false);}}}>{loggingOut?'Saving and logging out...':'Log out'}</button></div></div>}
      {auth && hasLegacyData() && <div className="card settings-section"><h2>Existing data on this device</h2><p>Copy your previous local Herin workspace into this account. Your original local copy will be kept.</p><button className="btn btn-secondary" disabled={importing} onClick={async()=>{setImporting(true);try{await importLegacyData();window.location.reload();}catch(e){pushToast(e.message,'error');setImporting(false);}}}>{importing?'Importing…':'Import local workspace'}</button></div>}
      <div className="card settings-section"><h2>Install & offline access</h2><OfflineStatus details/><p>Background notifications require push notification setup. In-app reminders work while Herin is open.</p></div>
      <div className="card settings-section">
        <div className="section-title">Appearance & profile</div>
        <div className="settings-row"><div><div className="label">Display name</div><div className="desc">Personalize your account across devices.</div></div><input className="input" aria-label="Display name" style={{maxWidth:220}} value={settings.displayName || ''} onChange={e => updateSettings({displayName:e.target.value})} /></div>
        <div className="settings-row"><div><div className="label">Color mode</div><div className="desc">Choose your reading environment.</div></div><select className="select" aria-label="Color mode" value={settings.mode || 'system'} onChange={e => updateSettings({mode:e.target.value})}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Follow system</option></select></div>
        <div className="settings-row"><div><div className="label">Theme</div><div className="desc">A coordinated accent for your workspace.</div></div><div className="theme-options">{['ocean','forest','plum'].map(theme => <button key={theme} className={`chip ${settings.theme === theme ? 'active' : ''}`} aria-pressed={settings.theme === theme} onClick={() => updateSettings({theme})}>{theme[0].toUpperCase()+theme.slice(1)}</button>)}</div></div>
      </div>
      <div className="card settings-section">
        <div className="section-title">
          <Bell size={15} style={{ verticalAlign: -2, marginRight: 6 }} /> Class reminders
        </div>

        <div className="settings-row">
          <div>
            <div className="label">Remind me before class</div>
            <div className="desc">
              Get an in-app alert{notificationsSupported() ? ' and a browser notification' : ''} before each class starts. Keep Herin open to receive reminders; closed-browser delivery is not supported. Times follow your device time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
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
            <div className="desc">How long before a class you'd like to be notified.</div>
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

        {notificationsSupported() && (
          <div className="settings-row">
            <div>
              <div className="label">Browser permission</div>
              <div className="desc">
                {permission === 'granted' && 'Browser notifications are allowed.'}
                {permission === 'denied' && 'Browser notifications are blocked. Enable them in your browser\u2019s site settings to receive pop-up alerts; in-app reminders will still work.'}
                {permission === 'default' && 'You\u2019ll be asked to allow notifications when you turn reminders on.'}
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
