import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {BrowserWindow} from 'electron';
import type {Engine} from '../src/core/Engine';
import type {Scene, WindowInfo} from '../src/core/types';

export async function smokeTest(engine: Engine, windows: Map<BrowserWindow, WindowInfo>) {
  const result = path.join(os.tmpdir(), 'TakeBreak-rn-smoke-result.txt');
  const scene = (kind: Scene) => [...windows].find(([win, info]) => info.scene === kind && !win.isDestroyed())?.[0];
  try {
    assert(scene('settings')); assert.deepEqual(scene('settings')!.getContentSize(), [634, 681]);
    await scene('settings')!.webContents.executeJavaScript('document.fonts.ready');
    assert.match(await scene('settings')!.webContents.executeJavaScript('document.body.innerText'), /Ваш спокойный ритм/);
    await engine.dispatch({type: 'openPalette'}); assert(scene('palette')); assert.deepEqual(scene('palette')!.getContentSize(), [344, 451]);
    const original = engine.getSnapshot().settings.AccentColor;
    await engine.dispatch({type: 'previewColor', color: '#123456'}); assert.equal(engine.getSnapshot().accent, '#123456'); assert.equal(engine.getSnapshot().settings.AccentColor, original);
    await engine.dispatch({type: 'cancelColor'}); assert.equal(engine.getSnapshot().accent, original);
    await engine.dispatch({type: 'start'}); assert(scene('break')); const end = engine.getSnapshot().endAt;
    await engine.dispatch({type: 'collapse'}); assert(scene('mini')); assert(!scene('break')); assert.equal(engine.getSnapshot().endAt, end);
    await engine.dispatch({type: 'restore'}); assert(scene('break')); assert(!scene('mini')); assert.equal(engine.getSnapshot().endAt, end);
    await engine.dispatch({type: 'finish'}); assert(!scene('break')); assert(!engine.getSnapshot().breaking);
    await fs.writeFile(result, 'PASS\n');
  } catch (e) {await fs.writeFile(result, `FAIL\n${String(e)}\n`); throw e;}
}
