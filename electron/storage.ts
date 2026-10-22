import fs from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {app} from 'electron';
import type {Settings} from '../src/core/settings';

export const dataDir = () => process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'TakeBreak') : process.platform === 'darwin' ? path.join(homedir(), 'Library', 'Application Support', 'TakeBreak') : path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'TakeBreak');
export async function readJSON(dir: string): Promise<string | null> {try {return await fs.readFile(path.join(dir, 'settings.json'), 'utf8');} catch (e) {if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e;}}
export async function saveJSON(dir: string, settings: Settings): Promise<void> {
  await fs.mkdir(dir, {recursive: true, mode: 0o700});
  const file = path.join(dir, 'settings.json'), temporary = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {const handle = await fs.open(temporary, 'wx', 0o600); try {await handle.writeFile(JSON.stringify(settings, null, 2)); await handle.sync();} finally {await handle.close();} await fs.rename(temporary, file);}
  finally {await fs.unlink(temporary).catch(() => {});}
}
const startupPath = () => path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'autostart', 'take-break.desktop');
export async function startupEnabled(): Promise<boolean> {try {await fs.access(startupPath()); return true;} catch (e) {if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e;}}
export function desktopEntry(executable: string): string {
  const quote = executable.replace(/[\\"`$%]/g, c => c === '%' ? '%%' : '\\' + c).replace(/\\/g, '\\\\');
  return `[Desktop Entry]\nType=Application\nName=Take Break\nExec="${quote}" --tray\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
}
export async function setStartup(enabled: boolean): Promise<void> {
  if (!enabled) {await fs.unlink(startupPath()).catch(e => {if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;}); return;}
  if (!app.isPackaged) throw Error('Автозапуск доступен в собранном приложении.');
  const executable = process.env.APPIMAGE || app.getPath('exe');
  if (/[\r\n]/.test(executable)) throw Error('Недопустимый путь приложения.');
  await fs.mkdir(path.dirname(startupPath()), {recursive: true, mode: 0o700});
  await fs.writeFile(startupPath(), desktopEntry(executable), {mode: 0o600});
}
