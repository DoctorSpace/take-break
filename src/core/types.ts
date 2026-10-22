import type {Settings} from './settings';
export type Scene = 'settings' | 'palette' | 'break' | 'mini';
export interface Bounds {x: number; y: number; width: number; height: number}
export interface Capture {id: string; bounds: Bounds; image: string; primary: boolean}
export interface WindowInfo {scene: Scene; capture?: Capture}
export interface Snapshot {
  ready: boolean; settings: Settings; nextBreak: number | null; endAt: number | null;
  remainingMs: number; durationMs: number; previewSeconds: number; breaking: boolean;
  collapsed: boolean; paletteOpen: boolean; accent: string; heading: string;
  error: string; startup: boolean; holdProgress: number;
}
export type Command =
  | {type: 'edit'; settings: Settings}
  | {type: 'previewColor' | 'acceptColor'; color: string}
  | {type: 'tick' | 'start' | 'startFromMain' | 'finish' | 'preview' | 'collapse' | 'restore' | 'openSettings' | 'closeSettings' | 'openPalette' | 'cancelColor' | 'toggleEnabled' | 'toggleStartup' | 'holdStart' | 'holdCancel' | 'lock' | 'unlock' | 'resume' | 'displays' | 'exit'};
export interface Services {
  load(): Promise<{json: string | null; startup: boolean}>;
  save(settings: Settings): Promise<void>;
  setStartup(enabled: boolean): Promise<void>;
  capture(): Promise<Capture[]>;
  open(info: WindowInfo): Promise<void>;
  close(scene: Scene): Promise<void>;
  exit(): Promise<void>;
  log(error: unknown): void;
}
export interface Client {
  getSnapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  command(command: Command): void;
}
