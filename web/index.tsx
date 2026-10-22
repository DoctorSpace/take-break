import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from '../src/App';
import {Engine} from '../src/core/Engine';
import {defaults} from '../src/core/settings';
import type {Client, Command, Snapshot, WindowInfo} from '../src/core/types';
import './style.css';
declare global {interface Window {takeBreak?: {bootstrap(): Promise<{state: Snapshot; info: WindowInfo}>; command(c: Command): Promise<void>; subscribe(callback: (s: Snapshot) => void): () => void}}}

const root = createRoot(document.getElementById('root')!);
async function start() {
  const bridge = window.takeBreak;
  if (bridge) {
    const {state: initial, info} = await bridge.bootstrap(); let state = initial; const listeners = new Set<() => void>();
    const client: Client = {getSnapshot: () => state, subscribe: listener => {listeners.add(listener); return () => {listeners.delete(listener);};}, command: c => {void bridge.command(c).catch(console.error);}};
    bridge.subscribe(next => {state = next; for (const listener of listeners) listener();});
    document.body.dataset.scene = info.scene;
    root.render(<App client={client} info={info} />);
  } else {
    // Browser-only development preview: no tray, filesystem or startup privileges.
    let info: WindowInfo = {scene: 'settings'};
    const previewSettings = {...defaults(), Enabled: false, AccentColor: '#C4B8DB', StartTime: '10:00', EndTime: '19:00'};
    const render = () => {document.body.dataset.scene = info.scene; root.render(<App key={info.scene} client={engine} info={info} />);};
    const engine = new Engine({load: async () => ({json: JSON.stringify(previewSettings), startup: false}), save: async () => {}, setStartup: async () => {throw Error('Автозапуск доступен только в приложении.');}, capture: async () => [{id: 'preview', bounds: {x: 0, y: 0, width: innerWidth, height: innerHeight}, primary: true, image: ''}], open: async next => {info = next; render();}, close: async scene => {if (info.scene === scene && scene !== 'settings') {info = {scene: 'settings'}; render();}}, exit: async () => {}, log: console.error});
    await engine.initialize(); render(); setInterval(() => engine.command({type: 'tick'}), 50);
  }
}
void start();
