import {contextBridge, ipcRenderer} from 'electron';
import type {Command, Snapshot, WindowInfo} from '../src/core/types';
contextBridge.exposeInMainWorld('takeBreak', {
  bootstrap: (): Promise<{state: Snapshot; info: WindowInfo}> => ipcRenderer.invoke('tb:bootstrap'),
  command: (command: Command) => ipcRenderer.invoke('tb:command', command),
  subscribe: (callback: (state: Snapshot) => void) => {
    const listener = (_: Electron.IpcRendererEvent, state: Snapshot) => callback(state);
    ipcRenderer.on('tb:state', listener);
    return () => {ipcRenderer.removeListener('tb:state', listener);};
  },
});
