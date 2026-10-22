import {createReadStream} from 'node:fs';
import {lstat, readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const installer = /\.(?:exe|msi|msix|msixbundle|zip|dmg|pkg|appimage|deb|rpm|tar\.gz|tar\.xz)$/i;

export async function collectReleaseFiles(directory) {
  const root = path.resolve(directory);
  let entries;
  try {entries = await readdir(root, {withFileTypes: true});}
  catch (e) {if (e.code === 'ENOENT') throw Error(`Нет папки ${root}. Сначала положите в неё готовые файлы релиза.`); throw e;}
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    // Do not upload linux-unpacked/, dependencies, logs, or symlinks outside it.
    if (!entry.isFile() || !installer.test(entry.name)) continue;
    if (/[\x00-\x1f\x7f/\\]/.test(entry.name)) throw Error(`Недопустимое имя файла: ${JSON.stringify(entry.name)}`);
    const file = path.join(root, entry.name), stat = await lstat(file);
    if (!stat.isFile() || !stat.size) throw Error(`Файл релиза пуст или не является обычным файлом: ${entry.name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    files.push({name: entry.name, path: file, size: stat.size, mtimeMs: stat.mtimeMs, sha256: hash.digest('hex')});
  }
  if (!files.length) throw Error(`В ${root} нет готовых установщиков или архивов. JS-бандлы не являются релизными файлами.`);
  return files;
}

function apiBase(value) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw Error('GitLab API должен использовать HTTPS и не содержать токенов в URL.');
  }
  const base = url.href.replace(/\/$/, '');
  if (!base.endsWith('/api/v4')) throw Error('Адрес API должен заканчиваться на /api/v4.');
  return base;
}

export function releaseLinks({apiUrl, project, tag, packageName = 'take-break'}, files) {
  const base = `${apiBase(apiUrl)}/projects/${encodeURIComponent(project)}/packages/generic/${encodeURIComponent(packageName)}/${encodeURIComponent(tag)}`;
  return files.map(file => ({name: file.name, url: `${base}/${encodeURIComponent(file.name)}`, direct_asset_path: `/binaries/${file.name}`, link_type: 'package'}));
}

class ApiError extends Error {
  constructor(status, message) {super(message); this.status = status;}
}

export async function publishRelease(options) {
  const {tag, project, directory = 'release', token, jobToken, name, description, dryRun = false, logger = console.log, fetchImpl = fetch} = options;
  if (!tag || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(tag)) throw Error('Укажите --tag, например v0.8.0, без пробелов и слешей.');
  if (!project || /[\r\n]/.test(project)) throw Error('Укажите --project: ID проекта или путь group/project.');
  const api = apiBase(options.apiUrl || 'https://gitlab.com/api/v4');
  const files = await collectReleaseFiles(directory);
  const links = releaseLinks({apiUrl: api, project, tag}, files);
  if (dryRun) {
    logger(`Проверка без публикации: ${project}, тег ${tag}`);
    for (const file of files) logger(`${file.name} (${file.size} байт), SHA256 ${file.sha256}`);
    return {tag, files: files.map(f => f.name), links, dryRun: true, releaseURL: null};
  }
  const auth = token ? {'PRIVATE-TOKEN': token} : jobToken ? {'JOB-TOKEN': jobToken} : null;
  if (!auth) throw Error('Нужен GITLAB_TOKEN с правом api или CI_JOB_TOKEN. Не передавайте токен аргументом командной строки.');
  const projectAPI = `${api}/projects/${encodeURIComponent(project)}`;
  const releasesAPI = `${projectAPI}/releases`, releaseAPI = `${releasesAPI}/${encodeURIComponent(tag)}`;

  async function request(url, init = {}, allow404 = false) {
    const response = await fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(30 * 60_000), ...init, headers: {...auth, ...init.headers}});
    if (response.status === 404 && allow404) {await response.text(); return null;}
    if (!response.ok) {
      const body = (await response.text()).slice(0, 2000);
      throw new ApiError(response.status, `GitLab API: HTTP ${response.status}: ${body}`);
    }
    return response;
  }
  async function jsonRequest(url, method, value) {
    const response = await request(url, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
    return response.json();
  }
  async function getRelease() {const response = await request(releaseAPI, {}, true); return response ? response.json() : null;}

  async function remoteFile(url) {
    const apiOrigin = new URL(api).origin;
    for (let hop = 0; hop < 6; hop++) {
      // GitLab can redirect downloads to signed object-storage URLs. Never
      // forward PRIVATE-TOKEN/JOB-TOKEN to an object-storage server.
      const headers = new URL(url).origin === apiOrigin ? auth : {};
      const response = await fetchImpl(url, {redirect: 'manual', headers, signal: AbortSignal.timeout(30 * 60_000)});
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.text();
        if (!location) throw Error('GitLab вернул перенаправление без адреса файла.');
        const next = new URL(location, url);
        const local = ['127.0.0.1', 'localhost', '[::1]'].includes(next.hostname);
        if (next.username || next.password || (next.protocol !== 'https:' && !(local && next.protocol === 'http:'))) throw Error('Небезопасное перенаправление при скачивании файла.');
        url = next.href; continue;
      }
      if (response.status === 404 && hop === 0) {await response.text(); return null;}
      if (!response.ok) throw new ApiError(response.status, `Не удалось проверить опубликованный файл: HTTP ${response.status}`);
      return response;
    }
    throw Error('Слишком много перенаправлений при скачивании файла.');
  }

  // Publishing assets must not silently create a tag on an arbitrary branch.
  const tagResponse = await request(`${projectAPI}/repository/tags/${encodeURIComponent(tag)}`, {}, true);
  if (!tagResponse) throw Error(`Тег ${tag} не найден. Сначала отправьте этот тег в GitLab.`);
  await tagResponse.text();
  let release = await getRelease();

  function checkLinkConflicts(existing) {
    for (const link of links) {
      const sameName = existing.find(item => item.name === link.name);
      if (sameName && sameName.url !== link.url) throw Error(`В релизе уже есть другая ссылка «${link.name}». Она не будет перезаписана.`);
    }
  }
  checkLinkConflicts(release?.assets?.links || []);

  for (let i = 0; i < files.length; i++) {
    const file = files[i], link = links[i];
    const existing = await remoteFile(link.url);
    if (existing) {
      const hash = createHash('sha256');
      if (!existing.body) throw Error(`Не удалось прочитать опубликованный файл ${file.name}.`);
      for await (const chunk of existing.body) hash.update(chunk);
      if (hash.digest('hex') !== file.sha256) throw Error(`Файл ${file.name} этого тега уже опубликован с другим содержимым. Используйте новую версию или другое имя файла.`);
      logger(`Уже загружен: ${file.name}`);
      continue;
    }
    const current = await lstat(file.path);
    if (!current.isFile() || current.size !== file.size || current.mtimeMs !== file.mtimeMs) throw Error(`Файл изменился во время подготовки релиза: ${file.name}`);
    const stream = createReadStream(file.path);
    try {
      const uploaded = await request(link.url, {method: 'PUT', headers: {'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size)}, body: stream, duplex: 'half'});
      await uploaded.text();
    } finally {stream.destroy();}
    const after = await lstat(file.path);
    if (after.size !== file.size || after.mtimeMs !== file.mtimeMs) throw Error(`Файл изменился при загрузке: ${file.name}. Релиз не опубликован.`);
    logger(`Загружен: ${file.name}`);
  }

  if (!release) {
    try {
      release = await jsonRequest(releasesAPI, 'POST', {tag_name: tag, name: name || `Take Break ${tag}`, description: description ?? 'Готовые установщики и архивы доступны в Assets / Links.', assets: {links}});
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 409) throw e;
      release = await getRelease();
      if (!release) throw e;
    }
  }
  // Adding another platform later preserves existing files and hand-written notes.
  const existingLinks = release.assets?.links || [];
  checkLinkConflicts(existingLinks);
  for (const link of links) {
    if (existingLinks.some(item => item.url === link.url)) continue;
    const created = await jsonRequest(`${releaseAPI}/assets/links`, 'POST', link);
    existingLinks.push(created);
  }
  if (name !== undefined || description !== undefined) {
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    release = await jsonRequest(releaseAPI, 'PUT', patch);
  }
  const releaseURL = release._links?.self || null;
  logger(releaseURL ? `Релиз: ${releaseURL}` : `Файлы прикреплены к релизу ${tag}.`);
  return {tag, files: files.map(f => f.name), links, dryRun: false, releaseURL};
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const {values} = parseArgs({args, options: {
    tag: {type: 'string'}, project: {type: 'string'}, dir: {type: 'string'}, url: {type: 'string'}, 'api-url': {type: 'string'},
    name: {type: 'string'}, 'notes-file': {type: 'string'}, 'dry-run': {type: 'boolean'}, help: {type: 'boolean'},
  }});
  if (values.help) {
    console.log('npm run release:gitlab -- --tag v0.8.0 --project group/project [--dir release] [--url https://gitlab.com] [--dry-run]\nАвторизация: GITLAB_TOKEN (api) или CI_JOB_TOKEN. Тег должен существовать.');
    return;
  }
  if (values.url && values['api-url']) throw Error('Укажите --url или --api-url, но не оба параметра.');
  return publishRelease({
    tag: values.tag || env.CI_COMMIT_TAG, project: values.project || env.CI_PROJECT_ID, directory: values.dir || 'release',
    apiUrl: values['api-url'] || (values.url ? `${values.url.replace(/\/$/, '')}/api/v4` : env.CI_API_V4_URL || 'https://gitlab.com/api/v4'),
    token: env.GITLAB_TOKEN, jobToken: env.CI_JOB_TOKEN, name: values.name,
    description: values['notes-file'] ? await readFile(values['notes-file'], 'utf8') : undefined, dryRun: values['dry-run'],
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
