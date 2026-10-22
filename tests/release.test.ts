import {afterEach, describe, expect, it} from 'vitest';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {collectReleaseFiles, publishRelease, releaseLinks} from '../scripts/publish-release.mjs';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {for (const close of cleanup.splice(0).reverse()) await close();});
async function directory() {const dir = await mkdtemp(path.join(os.tmpdir(), 'take-break-release-test-')); cleanup.push(() => rm(dir, {recursive: true, force: true})); return dir;}
async function mockGitLab() {
  const requests: Array<{method: string; url: string; privateToken?: string; jobToken?: string}> = [];
  const files = new Map<string, Buffer>();
  let release: any = null, tagExists = true, nextID = 1;
  const json = (response: ServerResponse, status: number, value: unknown) => {response.writeHead(status, {'Content-Type': 'application/json'}); response.end(JSON.stringify(value));};
  const body = async (request: IncomingMessage) => {const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks);};
  const server = createServer((request, response) => {void (async () => {
    const url = request.url!, method = request.method!;
    requests.push({method, url, privateToken: request.headers['private-token'] as string, jobToken: request.headers['job-token'] as string});
    const releases = '/api/v4/projects/42/releases', item = `${releases}/v0.8.0`;
    if (url === '/api/v4/projects/42/repository/tags/v0.8.0') return json(response, tagExists ? 200 : 404, {name: 'v0.8.0'});
    if (url.startsWith('/api/v4/projects/42/packages/generic/take-break/v0.8.0/')) {
      const name = decodeURIComponent(url.split('/').pop()!);
      if (method === 'PUT') {files.set(name, await body(request)); return json(response, 201, {message: '201 Created'});}
      if (files.has(name)) {response.writeHead(200, {'Content-Type': 'application/octet-stream'}); response.end(files.get(name)); return;}
      return json(response, 404, {message: 'not found'});
    }
    if (url === item && method === 'GET') return json(response, release ? 200 : 404, release || {});
    if (url === releases && method === 'POST') {
      const data = JSON.parse((await body(request)).toString());
      release = {...data, _links: {self: 'https://gitlab.example/group/project/-/releases/v0.8.0'}, assets: {links: data.assets.links.map((l: object) => ({...l, id: nextID++}))}};
      return json(response, 201, release);
    }
    if (url === `${item}/assets/links` && method === 'POST') {const link = {...JSON.parse((await body(request)).toString()), id: nextID++}; release.assets.links.push(link); return json(response, 201, link);}
    if (url === item && method === 'PUT') {Object.assign(release, JSON.parse((await body(request)).toString())); return json(response, 200, release);}
    json(response, 500, {message: `unexpected ${method} ${url}`});
  })().catch(error => json(response, 500, {message: String(error)}));});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => {server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();}));
  const address = server.address() as {port: number};
  return {apiUrl: `http://127.0.0.1:${address.port}/api/v4`, requests, files, get release() {return release;}, set release(value: any) {release = value;}, noTag() {tagExists = false;}};
}
const identity = {tag: 'v0.8.0', project: '42', token: 'private-test-token', logger: () => {}};

describe('release files', () => {
  it('selects top-level installers for every platform, not dependencies/bundles', async () => {
    const dir = await directory();
    for (const name of ['TakeBreak.exe', 'TakeBreak.dmg', 'TakeBreak.AppImage', 'TakeBreak-linux.tar.gz', 'TakeBreak-mac.zip', 'builder-debug.yml', 'settings.json', 'index.js']) await writeFile(path.join(dir, name), 'test');
    await mkdir(path.join(dir, 'node_modules')); await writeFile(path.join(dir, 'node_modules', 'secret.exe'), 'do not upload');
    const files = await collectReleaseFiles(dir);
    expect(files.map(f => f.name).sort()).toEqual(['TakeBreak.AppImage', 'TakeBreak.dmg', 'TakeBreak.exe', 'TakeBreak-linux.tar.gz', 'TakeBreak-mac.zip'].sort());
    expect(files.every(f => /^[a-f\d]{64}$/.test(f.sha256))).toBe(true);
  });
  it('does not create an empty release', async () => {const dir = await directory(); await expect(collectReleaseFiles(dir)).rejects.toThrow(/нет готовых/); await writeFile(path.join(dir, 'empty.exe'), ''); await expect(collectReleaseFiles(dir)).rejects.toThrow(/пуст/);});
  it('encodes project and file paths without credentials in links', () => {
    const [link] = releaseLinks({apiUrl: 'https://gitlab.example/api/v4', project: 'group/my-project', tag: 'v0.8.0'}, [{name: 'Take Break.exe'}]);
    expect(link.url).toBe('https://gitlab.example/api/v4/projects/group%2Fmy-project/packages/generic/take-break/v0.8.0/Take%20Break.exe');
    expect(link.direct_asset_path).toBe('/binaries/Take Break.exe');
  });
  it('supports an offline dry run without tokens or requests', async () => {
    const dir = await directory(); await writeFile(path.join(dir, 'TakeBreak.exe'), 'test');
    const result = await publishRelease({...identity, directory: dir, token: undefined, dryRun: true, fetchImpl: async () => {throw Error('must not connect');}});
    expect(result.dryRun).toBe(true); expect(result.files).toEqual(['TakeBreak.exe']);
  });
  it('rejects unsafe API URLs', async () => {
    const dir = await directory(); await writeFile(path.join(dir, 'TakeBreak.exe'), 'test');
    await expect(publishRelease({...identity, directory: dir, apiUrl: 'http://gitlab.example/api/v4'})).rejects.toThrow(/HTTPS/);
    await expect(publishRelease({...identity, directory: dir, apiUrl: 'https://token@gitlab.example/api/v4'})).rejects.toThrow(/HTTPS/);
  });
});
describe('GitLab publication against a local test server', () => {
  it('uploads actual bytes and attaches them to a release, safely retrying', async () => {
    const gitlab = await mockGitLab(), dir = await directory();
    await writeFile(path.join(dir, 'Take Break.exe'), 'windows binary'); await writeFile(path.join(dir, 'TakeBreak.dmg'), 'mac binary');
    const options = {...identity, directory: dir, apiUrl: gitlab.apiUrl};
    await publishRelease(options); await publishRelease(options);
    expect(gitlab.files.get('Take Break.exe')?.toString()).toBe('windows binary');
    expect(gitlab.release.assets.links).toHaveLength(2);
    expect(gitlab.release.assets.links.every((l: any) => l.url.includes('/packages/generic/') && !l.url.includes('/jobs/'))).toBe(true);
    expect(gitlab.requests.filter(r => r.method === 'PUT')).toHaveLength(2);
    expect(gitlab.requests.filter(r => r.method === 'POST')).toHaveLength(1);
    expect(gitlab.requests.every(r => r.privateToken === identity.token && !r.jobToken)).toBe(true);
  });
  it('adds another platform without deleting assets or hand-written notes', async () => {
    const gitlab = await mockGitLab(), linux = await directory(), mac = await directory();
    await writeFile(path.join(linux, 'TakeBreak.AppImage'), 'linux binary'); await writeFile(path.join(mac, 'TakeBreak.dmg'), 'mac binary');
    await publishRelease({...identity, directory: linux, apiUrl: gitlab.apiUrl}); gitlab.release.description = 'My release notes';
    await publishRelease({...identity, directory: mac, apiUrl: gitlab.apiUrl});
    expect(gitlab.release.assets.links.map((l: any) => l.name)).toEqual(['TakeBreak.AppImage', 'TakeBreak.dmg']);
    expect(gitlab.release.description).toBe('My release notes');
  });
  it('refuses to replace an existing binary with different bytes', async () => {
    const gitlab = await mockGitLab(), dir = await directory(); await writeFile(path.join(dir, 'TakeBreak.exe'), 'new binary'); gitlab.files.set('TakeBreak.exe', Buffer.from('existing binary'));
    await expect(publishRelease({...identity, directory: dir, apiUrl: gitlab.apiUrl})).rejects.toThrow(/другим содержимым/);
    expect(gitlab.requests.some(r => ['PUT', 'POST'].includes(r.method))).toBe(false);
  });
  it('requires an existing tag before uploading anything', async () => {
    const gitlab = await mockGitLab(), dir = await directory(); gitlab.noTag(); await writeFile(path.join(dir, 'TakeBreak.exe'), 'test');
    await expect(publishRelease({...identity, directory: dir, apiUrl: gitlab.apiUrl})).rejects.toThrow(/Тег.*не найден/);
    expect(gitlab.files.size).toBe(0);
  });
  it('supports CI_JOB_TOKEN without a personal token', async () => {
    const gitlab = await mockGitLab(), dir = await directory(); await writeFile(path.join(dir, 'TakeBreak.tar.gz'), 'test');
    await publishRelease({...identity, token: undefined, jobToken: 'job-test-token', directory: dir, apiUrl: gitlab.apiUrl});
    expect(gitlab.requests.every(r => r.jobToken === 'job-test-token' && !r.privateToken)).toBe(true);
  });
  it('does not forward credentials to redirected object storage', async () => {
    const gitlab = await mockGitLab(), dir = await directory(); await writeFile(path.join(dir, 'TakeBreak.exe'), 'same bytes');
    let storageChecked = false;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/packages/generic/')) return new Response(null, {status: 302, headers: {location: 'https://storage.example/signed-file?signature=test'}});
      if (url.startsWith('https://storage.example/')) {
        storageChecked = true;
        const headers = new Headers(init?.headers);
        expect(headers.has('PRIVATE-TOKEN')).toBe(false); expect(headers.has('JOB-TOKEN')).toBe(false);
        return new Response('same bytes');
      }
      return fetch(input, init);
    };
    await publishRelease({...identity, directory: dir, apiUrl: gitlab.apiUrl, fetchImpl});
    expect(storageChecked).toBe(true); expect(gitlab.files.size).toBe(0); expect(gitlab.release.assets.links).toHaveLength(1);
  });
  it('preserves conflicting hand-written asset links without uploading', async () => {
    const gitlab = await mockGitLab(), dir = await directory(); await writeFile(path.join(dir, 'TakeBreak.exe'), 'test');
    gitlab.release = {description: 'Notes', assets: {links: [{name: 'TakeBreak.exe', url: 'https://example.com/existing.exe'}]}};
    await expect(publishRelease({...identity, directory: dir, apiUrl: gitlab.apiUrl})).rejects.toThrow(/не будет перезаписана/);
    expect(gitlab.requests.some(r => ['POST', 'PUT'].includes(r.method))).toBe(false);
  });
});
