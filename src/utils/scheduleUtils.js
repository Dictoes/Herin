export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "HH:MM" -> minutes since midnight
export function toMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatDuration(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`;
}

// status: 'upcoming' | 'soon' (within reminder window) | 'live' | 'done'
export function classStatus(cls, now, reminderMinutes = 15) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(cls.startTime);
  const end = toMinutes(cls.endTime);
  if (nowMin >= start && nowMin < end) return 'live';
  if (nowMin < start) {
    return start - nowMin <= reminderMinutes ? 'soon' : 'upcoming';
  }
  return 'done';
}

export function classesForDay(classes, dayIndex) {
  return classes
    .filter((c) => c.days.includes(dayIndex))
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

export function todayClasses(classes, now = new Date()) {
  return classesForDay(classes, now.getDay());
}

export function nextClass(classes, now = new Date()) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // check today first
  const today = todayClasses(classes, now).filter((c) => toMinutes(c.endTime) > nowMin);
  if (today.length) return { cls: today[0], daysAway: 0 };

  // look ahead up to 7 days
  for (let offset = 1; offset <= 7; offset++) {
    const day = (now.getDay() + offset) % 7;
    const list = classesForDay(classes, day);
    if (list.length) return { cls: list[0], daysAway: offset };
  }
  return null;
}

export function minutesUntil(cls, now = new Date(), daysAway = 0) {
  const start = toMinutes(cls.startTime);
  const nowMin = now.getHours() * 60 + now.getMinutes() - daysAway * 1440;
  return start - nowMin;
}

export function upcomingList(classes, now = new Date(), count = 6) {
  // Build a flat list of (class, dateOffset) for the next 7 days, in order,
  // excluding classes already finished today.
  const result = [];
  for (let offset = 0; offset <= 7 && result.length < count; offset++) {
    const day = (now.getDay() + offset) % 7;
    const list = classesForDay(classes, day);
    for (const cls of list) {
      if (offset === 0) {
        const nowMin = now.getHours() * 60 + now.getMinutes();
        if (toMinutes(cls.endTime) <= nowMin) continue;
      }
      result.push({ cls, dayOffset: offset, dayIndex: day });
    }
  }
  return result.slice(0, count);
}
