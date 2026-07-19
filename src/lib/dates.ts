// Local-date helpers. Weeks start on Sunday to match Israeli convention and
// Postgres extract(dow) (0 = Sunday).

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay()); // getDay: 0=Sun
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function weekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isToday(d: Date): boolean {
  return toISODate(d) === toISODate(new Date());
}

export function formatDayMonth(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function formatTime(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5); // HH:MM
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr} שע׳`;
  const days = Math.floor(hr / 24);
  return `לפני ${days} ימים`;
}
