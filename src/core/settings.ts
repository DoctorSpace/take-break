export interface Settings {
  IntervalMinutes: number;
  DurationMinutes: number;
  StartTime: string;
  EndTime: string;
  Days: number[];
  Enabled: boolean;
  AccentColor: string;
}

export const defaults = (): Settings => ({IntervalMinutes: 40, DurationMinutes: 3, StartTime: '09:00', EndTime: '18:00', Days: [1, 2, 3, 4, 5], Enabled: true, AccentColor: '#B8CDB5'});
export const validColor = (s: unknown): s is string => typeof s === 'string' && /^#[\da-f]{6}$/i.test(s);
export function validate(s: Settings): string {
  if (!Number.isInteger(s.IntervalMinutes) || s.IntervalMinutes < 1 || s.IntervalMinutes > 480) return 'Интервал должен быть от 1 до 480 минут.';
  if (!Number.isInteger(s.DurationMinutes) || s.DurationMinutes < 1 || s.DurationMinutes > 120) return 'Перерыв должен длиться от 1 до 120 минут.';
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (typeof s.StartTime !== 'string' || typeof s.EndTime !== 'string' || !clock.test(s.StartTime) || !clock.test(s.EndTime)) return 'Укажите время в формате ЧЧ:ММ, например 09:00.';
  if (!Array.isArray(s.Days) || !s.Days.length || s.Days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return 'Выберите хотя бы один день недели.';
  if (typeof s.Enabled !== 'boolean') return 'Недопустимое значение переключателя перерывов.';
  if (!validColor(s.AccentColor)) return 'Введите цвет в формате #RRGGBB';
  return '';
}
export function decodeSettings(raw: string | null): Settings {
  if (raw === null) return defaults();
  const value: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Настройки должны быть JSON-объектом.');
  const s = {...defaults(), ...value} as Settings;
  const error = validate(s); if (error) throw Error(error);
  return s;
}
export const scheduleEqual = (a: Settings, b: Settings) => a.IntervalMinutes === b.IntervalMinutes && a.DurationMinutes === b.DurationMinutes && a.StartTime === b.StartTime && a.EndTime === b.EndTime && a.Enabled === b.Enabled && Array.from({length: 7}, (_, i) => i).every(d => a.Days.includes(d) === b.Days.includes(d));

function dayAt(now: Date, offset: number, clock: string): Date {
  const [h, m] = clock.split(':').map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m);
}
function window(s: Settings, now: Date, offset: number): [number, number, number] {
  const start = dayAt(now, offset, s.StartTime);
  const end = dayAt(now, offset + (s.EndTime <= s.StartTime ? 1 : 0), s.EndTime);
  return [+start, +end, start.getDay()];
}
export function isAllowed(s: Settings, time: number): boolean {
  if (!s.Enabled || validate(s)) return false;
  for (let i = -1; i <= 0; i++) {const [start, end, day] = window(s, new Date(time), i); if (s.Days.includes(day) && time >= start && time < end) return true;}
  return false;
}
export function nextBreak(s: Settings, time: number): number | null {
  if (!s.Enabled || validate(s)) return null;
  const interval = s.IntervalMinutes * 60_000;
  for (let i = -1; i <= 8; i++) {
    const [start, end, day] = window(s, new Date(time), i);
    const candidate = Math.max(time + interval, start + interval);
    if (s.Days.includes(day) && candidate >= start && candidate < end) return candidate;
  }
  return null;
}
export function countdown(ms: number): string {const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;}
const plural = (n: number, one: string, few: string, many: string) => n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
export function remaining(ms: number): string {const s = Math.max(0, Math.ceil(ms / 1000)); const n = s < 60 ? s : Math.ceil(s / 60); return `Осталось ${n} ${s < 60 ? plural(n, 'секунда', 'секунды', 'секунд') : plural(n, 'минута', 'минуты', 'минут')}`;}

export const headings = ['Время выдохнуть.', 'Побудьте в моменте.', 'Можно не спешить.', 'Маленькая пауза для вас.', 'Дела подождут.', 'Пора перевести дух.', 'Отпустите суету.', 'Вернитесь к себе.', 'Пусть мир подождёт.', 'Немного тишины.', 'Вдох. И выдох.', 'Сейчас можно просто быть.', 'Дайте мыслям отдохнуть.', 'Пауза — тоже часть пути.', 'Замедлитесь на минуту.', 'Вы уже многое сделали.', 'Время восстановить силы.', 'Оставьте спешку за окном.', 'Подарите себе передышку.', 'Новый вдох — новые силы.'];
export function pickHeading(previous: number, random = Math.random): number {let n = Math.floor(random() * (headings.length - (previous < 0 ? 0 : 1))); if (previous >= 0 && n >= previous) n++; return n;}
