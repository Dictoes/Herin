export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function currentPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return 'denied';
  }
}

export function sendBrowserNotification(title, options) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) { navigator.serviceWorker.getRegistration().then(reg=>reg?.showNotification(title,options)).catch(()=>{}); } else new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

