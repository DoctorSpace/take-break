import {app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, nativeTheme, powerMonitor, screen, Tray, type IpcMainInvokeEvent} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Engine} from '../src/core/Engine';
import {pngURI} from '../src/core/color';
import type {Capture, Command, Scene, Services, WindowInfo} from '../src/core/types';
import {dataDir, readJSON, saveJSON, setStartup, startupEnabled} from './storage';

const smoke = process.argv.includes('--smoke-test'), wayland = process.platform === 'linux' && !!process.env.WAYLAND_DISPLAY;
const windows = new Map<BrowserWindow, WindowInfo>();
let quitting = false, tray: Tray | null = null, traySupported = false, engine: Engine, directory = '', timer: NodeJS.Timeout;
const exec = promisify(execFile);
const mainFile = path.resolve(__dirname, '../web/index.html');
const log = (e: unknown) => {if (directory) void fs.mkdir(directory, {recursive: true}).then(() => fs.appendFile(path.join(directory, 'errors.log'), `${new Date().toISOString()} ${String(e)}\n`)).catch(() => {});};

function authorize(event: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !windows.has(win) || event.senderFrame !== event.sender.mainFrame) throw Error('Unknown renderer');
  return win;
}
function isCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object' || JSON.stringify(value).length > 16384) return false;
  const c = value as Command;
  if (['previewColor', 'acceptColor'].includes(c.type)) return 'color' in c && typeof c.color === 'string' && c.color.length <= 7;
  if (c.type === 'edit') return !!c.settings && Array.isArray(c.settings.Days) && c.settings.Days.length <= 7;
  return ['start', 'startFromMain', 'finish', 'preview', 'collapse', 'restore', 'openSettings', 'closeSettings', 'openPalette', 'cancelColor', 'toggleEnabled', 'toggleStartup', 'holdStart', 'holdCancel', 'exit'].includes(c.type);
}
async function createWindow(info: WindowInfo): Promise<void> {
  if (info.scene !== 'break') {const existing = [...windows].find(([w, i]) => i.scene === info.scene && !w.isDestroyed())?.[0]; if (existing) {existing.show(); existing.focus(); return;}}
  const sizes = {settings: [634, 681], palette: [344, 451], mini: [520, 72], break: [1280, 720]};
  const [width, height] = sizes[info.scene], overlay = info.scene === 'break', mini = info.scene === 'mini', palette = info.scene === 'palette';
  const parent = [...windows].find(([, i]) => i.scene === 'settings')?.[0];
  const display = screen.getPrimaryDisplay(), area = display.workArea;
  const bounds = overlay && info.capture ? info.capture.bounds : mini ? {x: area.x + Math.round((area.width - 520) / 2), y: area.y + 8, width, height} : {width, height};
  const win = new BrowserWindow({
    ...bounds, useContentSize: true, title: palette ? 'Акцентный цвет' : mini ? 'Перерыв · мини-панель' : 'Сделай перерыв',
    backgroundColor: mini ? '#00000000' : '#181818', frame: !overlay && !mini, transparent: mini,
    resizable: false, maximizable: false, minimizable: !palette && !overlay && !mini,
    alwaysOnTop: overlay || mini, skipTaskbar: palette || overlay || mini, show: false,
    parent: palette ? parent : undefined, modal: palette && !!parent,
    icon: path.resolve(__dirname, '../../Assets/app.ico'),
    webPreferences: {preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: !overlay && !mini},
  });
  windows.set(win, info); win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', (event, url) => {if (!url.startsWith('file:') || url.split('#')[0] !== win.webContents.getURL().split('#')[0]) event.preventDefault();});
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && info.scene !== 'settings') {event.preventDefault(); engine.command({type: palette ? 'cancelColor' : 'finish'});}
  });
  win.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    engine.command({type: palette ? 'cancelColor' : overlay || mini ? 'finish' : traySupported ? 'closeSettings' : 'exit'});
  });
  win.on('minimize', () => {if (info.scene === 'settings' && traySupported) engine.command({type: 'closeSettings'});});
  win.on('blur', () => {if (overlay) engine.command({type: 'holdCancel'});});
  win.on('closed', () => windows.delete(win));
  await win.loadFile(mainFile);
  if (overlay && wayland) win.setFullScreen(true);
  if (palette && parent) {const r = parent.getBounds(), c = win.getBounds(); win.setPosition(r.x + Math.round((r.width - c.width) / 2), r.y + Math.round((r.height - c.height) / 2));}
  if (overlay || mini) win.setAlwaysOnTop(true, 'screen-saver');
  if (overlay && !info.capture?.primary) win.showInactive(); else win.show();
}
async function closeWindow(scene: Scene): Promise<void> {
  for (const [win, info] of windows) if (info.scene === scene && !win.isDestroyed()) {
    if (scene === 'settings') {win.hide(); continue;}
    windows.delete(win); win.destroy();
  }
}
async function capture(): Promise<Capture[]> {
  const displays = wayland ? [screen.getPrimaryDisplay()] : screen.getAllDisplays();
  let sources: Electron.DesktopCapturerSource[] = [];
  try {sources = await desktopCapturer.getSources({types: ['screen'], thumbnailSize: {width: Math.max(...displays.map(d => Math.ceil(d.size.width * d.scaleFactor / 4))), height: Math.max(...displays.map(d => Math.ceil(d.size.height * d.scaleFactor / 4)))}});} catch (e) {log(e);}
  const primary = screen.getPrimaryDisplay().id;
  return displays.map((display, index) => {
    const source = sources.find(s => s.display_id === String(display.id)) || (wayland ? sources[0] : undefined);
    return {id: String(display.id), bounds: display.bounds, primary: display.id === primary || displays.length === 1, image: source && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : ''};
  });
}
function icon() {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const inside = (x - 32) ** 2 + (y - 32) ** 2 <= 900, bar = y >= 19 && y < 45 && (x >= 22 && x < 29 || x >= 35 && x < 42);
    pixels.set(inside ? bar ? [32, 32, 32, 255] : [200, 200, 200, 255] : [0, 0, 0, 0], (y * 64 + x) * 4);
  }
  return nativeImage.createFromDataURL(pngURI(pixels, 64, 64));
}
async function createTray() {
  if (process.platform === 'linux') {
    try {const {stdout} = await exec('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner', 'org.kde.StatusNotifierWatcher'], {timeout: 1500}); if (!stdout.includes('true')) return;} catch {return;}
  }
  tray = new Tray(icon()); traySupported = true; tray.setToolTip('Сделай перерыв'); tray.on('double-click', () => engine.command({type: 'openSettings'}));
  if (process.platform !== 'win32') tray.on('click', () => engine.command({type: 'openSettings'}));
  let enabled: boolean | undefined;
  const update = () => {const s = engine.getSnapshot(); if (enabled === s.settings.Enabled) return; enabled = s.settings.Enabled; tray?.setContextMenu(Menu.buildFromTemplate([
    {label: 'Открыть настройки', click: () => engine.command({type: 'openSettings'})},
    {label: 'Сделать перерыв сейчас', click: () => engine.command({type: 'start'})},
    {label: 'Пробный запуск через 3 секунды', click: () => engine.command({type: 'preview'})}, {type: 'separator'},
    {label: enabled ? 'Приостановить перерывы' : 'Возобновить перерывы', click: () => engine.command({type: 'toggleEnabled'})},
    {label: 'Продолжить работу', click: () => engine.command({type: 'finish'})}, {type: 'separator'}, {label: 'Выход', click: () => engine.command({type: 'exit'})},
  ]));}; update(); engine.subscribe(update);
}
async function main() {
  directory = smoke ? await fs.mkdtemp(path.join(os.tmpdir(), 'take-break-rn-smoke-')) : dataDir();
  nativeTheme.themeSource = 'dark';
  const services: Services = {
    load: async () => ({json: await readJSON(directory), startup: smoke || process.platform !== 'linux' ? false : await startupEnabled()}),
    save: settings => saveJSON(directory, settings),
    setStartup: enabled => smoke ? Promise.reject(Error('Smoke test cannot modify startup')) : setStartup(enabled),
    capture, open: createWindow, close: closeWindow,
    exit: async () => {quitting = true; clearInterval(timer); tray?.destroy(); for (const win of windows.keys()) win.destroy(); if (smoke) await fs.rm(directory, {recursive: true, force: true}); app.quit();}, log,
  };
  engine = new Engine(services); await engine.initialize();
  ipcMain.handle('tb:bootstrap', event => {const win = authorize(event); return {state: engine.getSnapshot(), info: windows.get(win)};});
  ipcMain.handle('tb:command', (event, command: unknown) => {authorize(event); if (!isCommand(command)) throw Error('Invalid command'); return engine.dispatch(command);});
  engine.subscribe(() => {for (const win of windows.keys()) if (!win.isDestroyed()) win.webContents.send('tb:state', engine.getSnapshot());});
  timer = setInterval(() => engine.command({type: 'tick'}), 50);
  await createTray();
  powerMonitor.on('lock-screen', () => engine.command({type: 'lock'}));
  powerMonitor.on('unlock-screen', () => engine.command({type: 'unlock'}));
  powerMonitor.on('resume', () => engine.command({type: 'resume'}));
  const displaysChanged = () => engine.command({type: 'displays'});
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
  if (!process.argv.includes('--tray') || !traySupported || smoke) await engine.dispatch({type: 'openSettings'});
  if (smoke) {const {smokeTest} = await import('./smoke'); await smokeTest(engine, windows); await services.exit();}
}
if (!smoke && !app.requestSingleInstanceLock()) app.quit(); else {
  app.on('second-instance', () => engine?.command({type: 'openSettings'}));
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {quitting = true;});
  app.whenReady().then(main).catch(e => {log(e); console.error(e); app.exit(1);});
}
