import {NativeEventEmitter, NativeModules} from 'react-native';
import {Engine} from '../core/Engine';
import type {Client, Command, Snapshot, WindowInfo} from '../core/types';

interface NativePlatform {
  registerWindow(id: string): Promise<void>;
  load(): Promise<string>;
  save(json: string): Promise<void>;
  setStartup(enabled: boolean): Promise<void>;
  capture(): Promise<string>;
  openWindow(json: string): Promise<void>;
  closeWindow(scene: string): Promise<void>;
  exit(): Promise<void>;
  getState(): Promise<string>;
  broadcastState(json: string): void;
  sendCommand(json: string): void;
  log(message: string): void;
  addListener(event: string): void;
  removeListeners(count: number): void;
}
let primary: Engine | undefined;
export async function nativeClient(info: WindowInfo): Promise<Client> {
  const native: NativePlatform | undefined = NativeModules.TakeBreakPlatform;
  if (!native) throw Error('Native TakeBreakPlatform module is not linked. Build the desktop host before running the bundle.');
  const events = new NativeEventEmitter(native);
  await native.registerWindow(info.scene === 'break' ? `break:${info.capture?.id}` : info.scene);
  if (info.scene === 'settings') {
    if (primary) return primary;
    const engine = new Engine({
      load: async () => JSON.parse(await native.load()),
      save: settings => native.save(JSON.stringify(settings, null, 2)),
      setStartup: enabled => native.setStartup(enabled),
      capture: async () => JSON.parse(await native.capture()),
      open: info => native.openWindow(JSON.stringify(info)), close: scene => native.closeWindow(scene), exit: () => native.exit(), log: e => native.log(String(e)),
    });
    primary = engine;
    engine.subscribe(() => native.broadcastState(JSON.stringify(engine.getSnapshot())));
    await engine.initialize();
    events.addListener('TakeBreakTick', () => engine.command({type: 'tick'}));
    events.addListener('TakeBreakCommand', (json: string) => {try {engine.command(JSON.parse(json) as Command);} catch (e) {native.log(String(e));}});
    return engine;
  }
  let state = JSON.parse(await native.getState()) as Snapshot;
  const listeners = new Set<() => void>();
  events.addListener('TakeBreakState', (json: string) => {state = JSON.parse(json); for (const listener of listeners) listener();});
  return {getSnapshot: () => state, subscribe: listener => {listeners.add(listener); return () => {listeners.delete(listener);};}, command: command => native.sendCommand(JSON.stringify(command))};
}
