// Shared, testable scheduling rules. All occurrence keys use UTC instants.
export function dueNotifications(classes, reminders, timezone, lead, now = new Date(), assignments = []) {
  const minutes = [5,10,15,20,30].includes(Number(lead)) ? Number(lead) : 15;
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }
  catch { return []; }
  const occurrences = [];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  // Scanning real instants handles midnight and daylight-saving transitions.
  for (let offset=0; offset<=minutes; offset++) {
    const start = new Date(Math.floor(now.getTime()/60000)*60000+offset*60000);
    if (start <= now) continue;
    const parts = Object.fromEntries(formatter.formatToParts(start).map(p=>[p.type,p.value]));
    for (const row of classes) {
      let pattern = {}; try { pattern = JSON.parse(row.schedule_pattern || '{}'); } catch { /* malformed legacy schedule */ }
      const c = {...pattern,...row.data};
      if (!Array.isArray(c.days) || !c.days.includes(days.indexOf(parts.weekday)) || c.startTime !== `${parts.hour}:${parts.minute}`) continue;
      occurrences.push({key:`class:${row.id}:${start.toISOString()}`,title:`Upcoming class: ${row.name}`,body:`Starts in ${Math.ceil((start-now)/60000)} minutes${c.location?` · ${c.location}`:''}`,url:'/#/schedule',expiresAt:start.toISOString()});
    }
  }
  for (const r of reminders) {
    const time = new Date(r.remind_at).getTime();
    if (r.is_completed || !Number.isFinite(time) || time > now.getTime() || time < now.getTime()-15*60000) continue;
    occurrences.push({key:`reminder:${r.id}:${new Date(time).toISOString()}`,title:r.title,body:'Your Herin reminder is due.',url:'/#/schedule',expiresAt:new Date(time+15*60000).toISOString()});
  }
  for (const assignment of assignments) {
    const due = new Date(assignment.due_date).getTime();
    const alertAt = due-minutes*60000;
    if (assignment.status==='completed' || !Number.isFinite(due) || now.getTime()<alertAt || now.getTime()>=due) continue;
    occurrences.push({
      key:`assignment:${assignment.id}:${new Date(due).toISOString()}`,
      title:assignment.title,
      body:`Assignment due in ${Math.ceil((due-now.getTime())/60000)} minutes.`,
      url:'/#/schedule',
      expiresAt:new Date(due).toISOString()
    });
  }
  return occurrences;
}

export function validSubscription(subscription) {
  try {
    const url = new URL(subscription.endpoint);
    const allowed = url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' || url.hostname.endsWith('.push.services.mozilla.com') || url.hostname === 'web.push.apple.com' || url.hostname.endsWith('.notify.windows.com');
    return allowed && url.protocol==='https:' && !url.port && !url.username && !url.password && subscription.endpoint.length<2048 && /^[A-Za-z0-9_-]{87}$/.test(subscription.keys?.p256dh || '') && /^[A-Za-z0-9_-]{22}$/.test(subscription.keys?.auth || '');
  } catch { return false; }
}
