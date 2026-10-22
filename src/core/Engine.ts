import {decodeSettings, defaults, headings, isAllowed, nextBreak, pickHeading, scheduleEqual, validate, validColor, type Settings} from './settings';
import {blurCapture} from './color';
import type {Client, Command, Services, Snapshot} from './types';
export interface Clock {wall(): number; mono(): number}
const systemClock: Clock = {wall: () => Date.now(), mono: () => performance.now()};

export class Engine implements Client {
  private snapshot: Snapshot = {ready: false, settings: defaults(), nextBreak: null, endAt: null, remainingMs: 0, durationMs: 0, previewSeconds: 0, breaking: false, collapsed: false, paletteOpen: false, accent: '#B8CDB5', heading: '', error: '', startup: false, holdProgress: 0};
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private draft: Settings | null = null;
  private saveDue = 0;
  private endMono = 0;
  private previewDue = 0;
  private holdAt: number | null = null;
  private lastWall: number;
  private locked = false;
  private previousHeading = -1;
  constructor(private services: Services, private clock: Clock = systemClock) {this.lastWall = clock.wall();}
  getSnapshot = (): Snapshot => this.snapshot;
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  private publish(patch: Partial<Snapshot> = {}) {this.snapshot = {...this.snapshot, ...patch}; for (const listener of this.listeners) listener();}
  async initialize() {
    try {const loaded = await this.services.load(); this.publish({startup: loaded.startup}); const settings = decodeSettings(loaded.json); this.publish({settings, accent: settings.AccentColor});}
    catch (e) {this.services.log(e);}
    this.publish({ready: true, nextBreak: nextBreak(this.snapshot.settings, this.clock.wall())});
  }
  command = (command: Command) => {void this.dispatch(command);};
  dispatch(command: Command): Promise<void> {
    this.queue = this.queue.then(() => this.handle(command)).catch(e => {this.services.log(e); this.publish({error: 'Не удалось выполнить действие. Предыдущие настройки остаются активными.'});});
    return this.queue;
  }
  private async save(settings: Settings): Promise<boolean> {
    const error = validate(settings); if (error) {this.publish({error}); return false;}
    try {await this.services.save(settings);} catch (e) {this.services.log(e); this.publish({error: 'Не удалось сохранить настройки. Предыдущие остаются активны.'}); return false;}
    const next = scheduleEqual(settings, this.snapshot.settings) ? this.snapshot.nextBreak : nextBreak(settings, this.clock.wall());
    this.publish({settings, nextBreak: next, accent: settings.AccentColor, error: ''}); return true;
  }
  private async flush(): Promise<boolean> {this.saveDue = 0; if (!this.draft) return !this.snapshot.error; const settings = this.draft; this.draft = null; return this.save(settings);}
  private async finish() {
    this.previewDue = 0; this.endMono = 0; this.holdAt = null;
    await this.services.close('break'); await this.services.close('mini');
    this.publish({breaking: false, collapsed: false, endAt: null, remainingMs: 0, durationMs: 0, previewSeconds: 0, holdProgress: 0, nextBreak: nextBreak(this.snapshot.settings, this.clock.wall())});
  }
  private async captures() {
    const captures = await this.services.capture();
    return captures.map(c => {try {return {...c, image: blurCapture(c.image)};} catch (e) {this.services.log(e); return {...c, image: ''};}});
  }
  private async begin() {
    if (this.snapshot.breaking || this.locked) return;
    this.previewDue = 0;
    await this.services.close('palette');
    const captures = await this.captures();
    if (!captures.length) throw Error('Не найдены мониторы.');
    const durationMs = this.snapshot.settings.DurationMinutes * 60_000;
    this.previousHeading = pickHeading(this.previousHeading);
    this.endMono = this.clock.mono() + durationMs;
    this.publish({breaking: true, paletteOpen: false, collapsed: false, accent: this.snapshot.settings.AccentColor, heading: headings[this.previousHeading], durationMs, remainingMs: durationMs, endAt: this.clock.wall() + durationMs, previewSeconds: 0});
    try {for (const capture of captures) await this.services.open({scene: 'break', capture});}
    catch (e) {await this.finish(); throw e;}
  }
  private async tick() {
    const now = this.clock.wall(), mono = this.clock.mono(), gap = now - this.lastWall; this.lastWall = now;
    if (Math.abs(gap) > 10_000) {await this.finish(); return;}
    if (this.saveDue && mono >= this.saveDue) await this.flush();
    if (this.locked) return;
    if (this.snapshot.breaking) {
      const remainingMs = Math.max(0, this.endMono - mono), holdProgress = this.holdAt === null ? 0 : Math.min(1, (mono - this.holdAt) / 1200);
      if (!remainingMs || holdProgress >= 1) await this.finish(); else this.publish({remainingMs, holdProgress});
    } else if (this.previewDue) {if (mono >= this.previewDue) await this.begin(); else this.publish({previewSeconds: Math.ceil((this.previewDue - mono) / 1000)});}
    else if (this.snapshot.nextBreak !== null && now >= this.snapshot.nextBreak) {if (isAllowed(this.snapshot.settings, now)) await this.begin(); else this.publish({nextBreak: nextBreak(this.snapshot.settings, now)});}
    else this.publish();
  }
  private async handle(c: Command) {
    switch (c.type) {
      case 'tick': await this.tick(); break;
      case 'edit': this.draft = {...c.settings, Days: [...c.settings.Days], Enabled: this.snapshot.settings.Enabled, AccentColor: this.snapshot.settings.AccentColor}; this.saveDue = this.clock.mono() + 500; break;
      case 'startFromMain': if (await this.flush()) await this.begin(); break;
      case 'start': await this.begin(); break;
      case 'finish': await this.finish(); break;
      case 'preview': if (!this.snapshot.breaking && !this.locked) {this.previewDue = this.clock.mono() + 3000; this.publish({previewSeconds: 3});} break;
      case 'toggleEnabled': if (await this.flush()) await this.save({...this.snapshot.settings, Enabled: !this.snapshot.settings.Enabled}); break;
      case 'toggleStartup': await this.services.setStartup(!this.snapshot.startup); this.publish({startup: !this.snapshot.startup}); break;
      case 'openSettings': if (this.snapshot.breaking) await this.finish(); await this.services.open({scene: 'settings'}); break;
      case 'closeSettings': await this.flush(); await this.services.close('palette'); await this.services.close('settings'); this.publish({paletteOpen: false, accent: this.snapshot.settings.AccentColor}); break;
      case 'openPalette': if (await this.flush()) {await this.services.open({scene: 'palette'}); this.publish({paletteOpen: true});} break;
      case 'previewColor': if (this.snapshot.paletteOpen && validColor(c.color)) this.publish({accent: c.color.toUpperCase()}); break;
      case 'acceptColor': if (validColor(c.color) && await this.save({...this.snapshot.settings, AccentColor: c.color.toUpperCase()})) {await this.services.close('palette'); this.publish({paletteOpen: false});} break;
      case 'cancelColor': await this.services.close('palette'); this.publish({paletteOpen: false, accent: this.snapshot.settings.AccentColor}); break;
      case 'collapse': if (this.snapshot.breaking && !this.snapshot.collapsed) {try {await this.services.close('break'); this.holdAt = null; await this.services.open({scene: 'mini'}); this.publish({collapsed: true, holdProgress: 0});} catch (e) {await this.finish(); throw e;}} break;
      case 'restore': if (this.snapshot.breaking && this.snapshot.collapsed) {try {await this.services.close('mini'); const captures = await this.captures(); if (this.clock.mono() >= this.endMono) {await this.finish(); break;} for (const capture of captures) await this.services.open({scene: 'break', capture}); this.publish({collapsed: false});} catch (e) {await this.finish(); throw e;}} break;
      case 'holdStart': if (this.snapshot.breaking && this.holdAt === null) this.holdAt = this.clock.mono(); break;
      case 'holdCancel': this.holdAt = null; this.publish({holdProgress: 0}); break;
      case 'lock': this.locked = true; await this.finish(); break;
      case 'unlock': this.locked = false; await this.finish(); break;
      case 'resume': case 'displays': await this.finish(); break;
      case 'exit': await this.flush(); await this.finish(); await this.services.exit(); break;
    }
  }
}
