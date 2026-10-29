#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join, isAbsolute, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HistoryStore} from './history-store.mjs';
import {createAccountService} from './account-service.mjs';
import {codexAuthFileSource} from './authorized-sources.mjs';
const fail = () => new Error('E_MANAGE_ARGUMENTS');
export async function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (!['accounts', 'refresh', 'history', 'serve'].includes(command)) throw fail();
  const aliases = []; const options = {};
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--all') { if (options.all) throw fail(); options.all = true; continue; }
    if (!['--alias', '--config', '--proxy', '--limit', '--port'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw fail();
    const value = argv[++i];
    if (key === '--alias') aliases.push(value);
    else { if (options[key] !== undefined) throw fail(); options[key] = value; }
  }
  if ((options.all && aliases.length) || (options.all && command !== 'refresh') ||
      (command === 'refresh' && !options.all && !aliases.length) ||
      (command === 'history' && aliases.length !== 1) ||
      (command === 'serve' && aliases.length) ||
      (options['--limit'] !== undefined && command !== 'history') ||
      (options['--port'] !== undefined && command !== 'serve')) throw fail();
  let definitions = [{alias: 'codex_local_01', displayName: 'Codex local', mode: 'CODEX_OAUTH',
    source: {type: 'CODEX_AUTH_FILE', path: join(homedir(), '.codex', 'auth.json')}}];
  if (options['--config']) {
    if (!isAbsolute(options['--config'])) throw fail();
    const bytes = await readFile(options['--config']);
    if (bytes.length > 128 * 1024) throw fail();
    const config = JSON.parse(bytes.toString('utf8'));
    if (!config || Object.keys(config).some(key => key !== 'accounts') || !Array.isArray(config.accounts)) throw fail();
    definitions = config.accounts;
  }
  const accounts = definitions.map(row => {
    if (!row || Object.keys(row).some(key => !['alias', 'displayName', 'mode', 'source'].includes(key)) ||
        row.mode !== 'CODEX_OAUTH' || row.source?.type !== 'CODEX_AUTH_FILE' ||
        Object.keys(row.source).some(key => !['type', 'path'].includes(key))) throw fail();
    return {alias: row.alias, displayName: row.displayName, mode: row.mode,
      loadAuthorizedAccount: codexAuthFileSource({alias: row.alias, path: row.source.path})};
  });
  let requestImpl;
  if (options['--proxy']) {
    const {createLoopbackProxyRequest} = await import('./transport.mjs');
    requestImpl = createLoopbackProxyRequest(options['--proxy']);
  }
  const store = new HistoryStore();
  const service = createAccountService({store, accounts, requestImpl});
  if (command === 'serve') {
    const port = options['--port'] === undefined ? 0 : Number(options['--port']);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw fail();
    await service.initialize();
    const {startManagementServer} = await import('./web-server.mjs');
    const server = await startManagementServer({service, store, port});
    process.stdout.write(`${server.url}#pair=${encodeURIComponent(server.pairingCode)}\n`);
    return server;
  }
  const result = await service.query({operation: command === 'accounts' ? 'cache' : command,
    ...(aliases.length ? {aliases} : {}),
    ...(options['--limit'] !== undefined ? {limit: Number(options['--limit'])} : {})});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('E_MANAGEMENT_FAILED\n'); process.exitCode = 1; });
}
