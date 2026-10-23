import http from 'node:http';
import https from 'node:https';
import {randomUUID, randomBytes, createHash, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {verifyBusinessResult} from './verifier.mjs';

const fail = (status, code) => { throw Object.assign(new Error(code), {status, code}); };
const token = () => randomBytes(32).toString('hex');
const canonical = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const equal = (a, b) => {
  const left = createHash('sha256').update(String(a)).digest();
  const right = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(left, right);
};
function exact(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      required.some(k => !Object.hasOwn(value, k)) ||
      Object.keys(value).some(k => ![...required, ...optional].includes(k))) fail(400, 'E_SCHEMA');
}
function text(value, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, 'E_SCHEMA');
  return value;
}
async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, 'E_CONTENT_TYPE');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) fail(413, 'E_BODY_LIMIT');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'E_JSON'); }
}
function providerPost(base, ca, credential, path, input) {
  return new Promise((resolve, reject) => {
    const bytes = Buffer.from(JSON.stringify(input));
    const req = https.request(new URL(path, base), {
      method:'POST', ca, rejectUnauthorized:true,
      headers:{'content-type':'application/json', 'content-length':bytes.length,
        authorization:`Bearer ${credential}`}
    }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 1024 * 1024) req.destroy(new Error('response limit'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        // No redirects, provider error text, credentials or transport diagnostics reach the UI.
        if (res.statusCode !== 200) return reject(Object.assign(new Error('E_PROVIDER'), {status:502, code:'E_PROVIDER'}));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('invalid provider JSON')); }
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error('provider timeout')), 8000);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', () => reject(Object.assign(new Error('E_PROVIDER'), {status:502, code:'E_PROVIDER'})));
    req.end(bytes);
  });
}

/** Local fixture only. The caller owns the Pool, Provider, accounts and Task installation. */
export async function openLocalBusiness({pool, providerUrl, providerCa, accounts,
  portalPort = 0, recordsPort = 0, businessId = randomUUID(),
  taskActions = {'local.record-create':'create', 'local.record-update':'update'}}) {
  const provider = new URL(providerUrl);
  if (provider.protocol !== 'https:' || provider.username || provider.password ||
      provider.pathname !== '/' || provider.search || provider.hash || !providerCa) throw new Error('HTTPS provider origin and CA required');
  if (!pool?.query || !pool?.connect) throw new Error('existing pg Pool required');
  text(businessId, 128);
  if (!Array.isArray(accounts) || !accounts.length) throw new Error('accounts required');
  exact(taskActions, [], Object.keys(taskActions));
  const actions = new Map(Object.entries(taskActions));
  for (const [taskId, action] of actions) {
    text(taskId, 200);
    if (!['create', 'update'].includes(action)) throw new Error('taskActions must map fixed task IDs to create/update');
  }
  const normalizeParams = params => {
    exact(params, ['recordKey', 'name', 'status']);
    return {recordKey:text(params.recordKey, 150), name:text(params.name), status:text(params.status, 80)};
  };
  const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
  const users = new Map(), credentials = new Set(), identities = new Set();
  for (const input of accounts) {
    exact(input, ['username', 'password', 'subjectId', 'tenantId', 'clientCredential']);
    const account = Object.freeze({...input});
    for (const value of Object.values(account)) text(value, 4096);
    const identity = canonical([account.tenantId, account.subjectId]);
    if (users.has(account.username) || credentials.has(account.clientCredential) || identities.has(identity)) throw new Error('accounts require distinct usernames, identities and client credentials');
    users.set(account.username, account); credentials.add(account.clientCredential); identities.add(identity);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS opendesk_local_business_records (
    business_id text NOT NULL, tenant_id text NOT NULL, subject_id text NOT NULL,
    record_key text NOT NULL, name text NOT NULL, status text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, tenant_id, subject_id, record_key))`);
  // This is BFF request/ACL metadata, not a second Run or Result ledger.
  await pool.query(`CREATE TABLE IF NOT EXISTS opendesk_local_business_requests (
    business_id text NOT NULL, tenant_id text NOT NULL, subject_id text NOT NULL,
    request_key text NOT NULL, input jsonb NOT NULL, job_id text,
    PRIMARY KEY (business_id, tenant_id, subject_id, request_key))`);
  // Expand existing request metadata in place; legacy rows remain manual/unbound.
  await pool.query('ALTER TABLE opendesk_local_business_requests ADD COLUMN IF NOT EXISTS execution_key TEXT');
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS opendesk_local_business_execution_key
    ON opendesk_local_business_requests (business_id, execution_key)`);
  const pages = await Promise.all(['portal', 'records'].map(name => readFile(new URL(`./${name}.html`, import.meta.url), 'utf8')));
  const sessions = {portal:new Map(), records:new Map()};
  const cookieNames = {portal:'od_local_portal', records:'od_local_records'};
  let portalOrigin, recordsOrigin;
  const scope = account => [businessId, account.tenantId, account.subjectId];
  const call = (account, route, input) => providerPost(provider, providerCa, account.clientCredential, `/v1/${route}`, input);
  const catalog = async account => {
    const result = await call(account, 'client-scope', {includeTaskSchemas:true});
    if (!Array.isArray(result.taskCatalog)) fail(502, 'E_PROVIDER');
    return result.taskCatalog.filter(task => actions.has(task.taskId) && task.siteOrigins?.includes(recordsOrigin)).map(task => ({
      taskId:task.taskId, version:task.version, manifestHash:task.manifestHash,
      sourceHash:task.sourceHash, title:task.title, paramsSchema:task.paramsSchema
    }));
  };
  const execution = async (account, executionKey) => {
    if (typeof executionKey !== 'string' || !/^[a-f0-9]{64}$/.test(executionKey)) fail(400, 'E_EXECUTION_KEY');
    const row = (await pool.query(`SELECT tenant_id, subject_id, input FROM opendesk_local_business_requests
      WHERE business_id=$1 AND execution_key=$2`, [businessId, executionKey])).rows[0];
    if (!row || row.tenant_id !== account.tenantId || row.subject_id !== account.subjectId ||
        actions.get(row.input.taskId) !== row.input.action) fail(403, 'E_EXECUTION_SCOPE');
    return {action:row.input.action, params:row.input.params};
  };
  function handler(kind) {
    return async (req, res) => {
      const origin = kind === 'portal' ? portalOrigin : recordsOrigin;
      const json = (value, status = 200) => {
        res.writeHead(status, {'content-type':'application/json; charset=utf-8'});
        res.end(JSON.stringify(value));
      };
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader('cross-origin-resource-policy', 'same-origin');
      try {
        if (req.headers.host !== new URL(origin).host) fail(403, 'E_HOST');
        if (req.headers.origin && req.headers.origin !== origin) fail(403, 'E_ORIGIN');
        const url = new URL(req.url, origin);
        const cookies = String(req.headers.cookie || '').split(';').map(v => v.trim());
        const sessionId = cookies.find(v => v.startsWith(cookieNames[kind] + '='))?.slice(cookieNames[kind].length + 1);
        const now = Date.now();
        for (const [id, session] of sessions[kind]) if (session.expires <= now) sessions[kind].delete(id);
        let session = sessions[kind].get(sessionId);
        const newSession = account => {
          if (sessions[kind].size >= 1000) fail(429, 'E_SESSION_LIMIT');
          if (sessionId) sessions[kind].delete(sessionId);
          const id = token();
          session = {account, csrf:token(), expires:now + 30 * 60 * 1000};
          sessions[kind].set(id, session);
          res.setHeader('set-cookie', `${cookieNames[kind]}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`);
        };
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === `/${kind}.html`)) {
          const nonce = token();
          res.setHeader('content-security-policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
          res.writeHead(200, {'content-type':'text/html; charset=utf-8'});
          return res.end(pages[kind === 'portal' ? 0 : 1].replace('<script>', `<script nonce="${nonce}">`));
        }
        if (req.method === 'GET' && url.pathname === '/api/session') {
          if (!session) newSession(null);
          return json({csrf:session.csrf, username:session.account?.username ?? null, expiresAt:session.expires});
        }
        if (!session) fail(401, 'E_LOGIN');
        if (req.method === 'POST') {
          if (req.headers.origin !== origin || !equal(req.headers['x-csrf-token'] || '', session.csrf)) fail(403, 'E_CSRF');
          const input = await body(req);
          if (url.pathname === '/api/login') {
            exact(input, ['username', 'password']);
            text(input.username); text(input.password, 4096);
            const account = users.get(input.username);
            if (!account || !equal(input.password, account.password)) fail(401, 'E_LOGIN');
            newSession(account);
            return json({csrf:session.csrf, username:account.username});
          }
          if (!session.account) fail(401, 'E_LOGIN');
          const account = session.account;
          if (url.pathname === '/api/logout') {
            exact(input, []); newSession(null); return json({csrf:session.csrf});
          }
          if (kind === 'records' && ['/api/records/create', '/api/records/update'].includes(url.pathname)) {
            exact(input, ['recordKey', 'name', 'status'], ['executionKey']);
            const params = normalizeParams({recordKey:input.recordKey, name:input.name, status:input.status});
            if (Object.hasOwn(input, 'executionKey')) {
              const approved = await execution(account, input.executionKey);
              if (approved.action !== url.pathname.split('/').at(-1) ||
                  !equal(digest(approved.params), digest(params))) fail(403, 'E_EXECUTION_INPUT');
            }
            // A login/logout may rotate this cookie while execution lookup awaits PG.
            if (sessions[kind].get(sessionId) !== session || session.expires <= Date.now()) fail(401, 'E_LOGIN');
            const args = [...scope(account), input.recordKey, input.name, input.status];
            let result;
            if (url.pathname.endsWith('/create')) {
              result = await pool.query(`INSERT INTO opendesk_local_business_records
                (business_id, tenant_id, subject_id, record_key, name, status) VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT DO NOTHING RETURNING record_key AS "recordKey", name, status, updated_at AS "updatedAt"`, args);
              if (!result.rowCount) {
                result = await pool.query(`SELECT record_key AS "recordKey", name, status, updated_at AS "updatedAt"
                  FROM opendesk_local_business_records WHERE business_id=$1 AND tenant_id=$2 AND subject_id=$3 AND record_key=$4`, args.slice(0, 4));
                if (result.rows[0].name !== input.name || result.rows[0].status !== input.status) fail(409, 'E_RECORD_CONFLICT');
              }
            } else {
              result = await pool.query(`UPDATE opendesk_local_business_records SET name=$5, status=$6, updated_at=now()
                WHERE business_id=$1 AND tenant_id=$2 AND subject_id=$3 AND record_key=$4
                RETURNING record_key AS "recordKey", name, status, updated_at AS "updatedAt"`, args);
              if (!result.rowCount) fail(404, 'E_RECORD_NOT_FOUND');
            }
            return json({record:result.rows[0]});
          }
          if (kind === 'portal' && url.pathname === '/api/submit') {
            exact(input, ['requestKey', 'taskId', 'version', 'params']);
            text(input.requestKey, 150);
            const task = (await catalog(account)).find(t => t.taskId === input.taskId && t.version === input.version);
            if (!task) fail(403, 'E_TASK_SCOPE');
            const params = normalizeParams(input.params);
            // Provider remains the schema/permission authority. No caller-supplied code or target.
            const payload = {taskId:task.taskId, version:task.version, manifestHash:task.manifestHash,
              sourceHash:task.sourceHash, action:actions.get(task.taskId), params};
            const args = [...scope(account), input.requestKey];
            // Commit intent before contacting Provider: a timeout must not erase
            // the key/content binding while a remote side effect may have happened.
            await pool.query(`INSERT INTO opendesk_local_business_requests
              (business_id, tenant_id, subject_id, request_key, input, execution_key) VALUES ($1,$2,$3,$4,$5,$6)
              ON CONFLICT (business_id, tenant_id, subject_id, request_key) DO NOTHING`, [...args, canonical(payload), token()]);
            const db = await pool.connect();
            try {
              await db.query('BEGIN');
              const row = (await db.query(`SELECT input, job_id, execution_key FROM opendesk_local_business_requests
                WHERE business_id=$1 AND tenant_id=$2 AND subject_id=$3 AND request_key=$4 FOR UPDATE`, args)).rows[0];
              if (canonical(row.input) !== canonical(payload)) fail(409, 'E_REQUEST_CONFLICT');
              let jobId = row.job_id;
              if (!jobId) {
                const requestKey = createHash('sha256').update(canonical(args)).digest('hex');
                const {action: _action, ...dispatch} = payload;
                const target = new URL('/', recordsOrigin);
                target.searchParams.set('executionKey', row.execution_key);
                const result = await call(account, 'submit', {requestKey, ...dispatch, controlProtocol:2, target:{mode:'owned', url:target.href}});
                jobId = text(result.jobId, 200);
                await db.query(`UPDATE opendesk_local_business_requests SET job_id=$5
                  WHERE business_id=$1 AND tenant_id=$2 AND subject_id=$3 AND request_key=$4`, [...args, jobId]);
              }
              await db.query('COMMIT');
              return json({jobId, requestKey:input.requestKey});
            } catch (error) { await db.query('ROLLBACK'); throw error; }
            finally { db.release(); }
          }
          if (kind === 'portal' && ['/api/job-status', '/api/job-cancel'].includes(url.pathname)) {
            exact(input, ['jobId']); text(input.jobId);
            const owned = await pool.query(`SELECT 1 FROM opendesk_local_business_requests
              WHERE business_id=$1 AND tenant_id=$2 AND subject_id=$3 AND job_id=$4`, [...scope(account), input.jobId]);
            if (!owned.rowCount) fail(404, 'E_JOB_NOT_FOUND');
            return json(await call(account, url.pathname.slice(5), input));
          }
          fail(404, 'E_ROUTE');
        }
        if (!session.account) fail(401, 'E_LOGIN');
        if (req.method === 'GET' && kind === 'portal' && url.pathname === '/api/catalog') return json({tasks:await catalog(session.account), target:recordsOrigin + '/'});
        if (req.method === 'GET' && kind === 'portal' && url.pathname === '/api/jobs') {
          const result = await pool.query(`SELECT request_key AS "requestKey", job_id AS "jobId"
            FROM opendesk_local_business_requests WHERE business_id=$1 AND tenant_id=$2 AND subject_id=$3 AND job_id IS NOT NULL
            ORDER BY request_key LIMIT 100`, scope(session.account));
          return json({jobs:result.rows});
        }
        if (req.method === 'GET' && kind === 'records' && url.pathname === '/api/execution') {
          if (url.searchParams.size !== 1 || !url.searchParams.has('executionKey')) fail(400, 'E_SCHEMA');
          return json(await execution(session.account, url.searchParams.get('executionKey')));
        }
        if(req.method==='GET'&&kind==='records'&&url.pathname==='/api/verification-context'){
          if(url.searchParams.size!==1||!url.searchParams.has('jobId'))fail(400,'E_SCHEMA');
          const jobId=text(url.searchParams.get('jobId'),200);
          const rows=(await pool.query(`SELECT request_key,job_id,execution_key,input
            FROM opendesk_local_business_requests
            WHERE business_id=$1 AND tenant_id=$2 AND subject_id=$3 AND job_id=$4 LIMIT 2`,
          [...scope(session.account),jobId])).rows;
          if(rows.length!==1||!rows[0].execution_key)fail(404,'E_VERIFICATION_CONTEXT');
          const row=rows[0],{taskId,version,manifestHash,sourceHash,action,params}=row.input;
          if(actions.get(taskId)!==action)fail(403,'E_EXECUTION_SCOPE');
          return json({requestKey:row.request_key,jobId:row.job_id,executionKey:row.execution_key,
            task:{taskId,version,manifestHash,sourceHash},action,params});
        }
        if(req.method==='GET'&&kind==='records'&&url.pathname==='/api/verify'){
          if(url.searchParams.size!==1||!url.searchParams.has('jobId'))fail(400,'E_SCHEMA');
          const jobId=text(url.searchParams.get('jobId'),200);
          const evidence=await verifyBusinessResult({recordsOrigin,jobId,allowResult:false,
            sessionFetch:(target,options)=>{
              if(new URL(target).origin!==recordsOrigin||options.method!=='GET'||options.redirect!=='error')fail(400,'E_SCHEMA');
              return fetch(target,{...options,headers:{cookie:`${cookieNames.records}=${sessionId}`}});
            }});
          if(sessions.records.get(sessionId)!==session||session.expires<=Date.now())fail(401,'E_LOGIN');
          return json(evidence);
        }
        if (req.method === 'GET' && kind === 'records' && url.pathname === '/api/records') {
          if ([...url.searchParams.keys()].some(k => k !== 'recordKey')) fail(400, 'E_SCHEMA');
          const key = url.searchParams.get('recordKey') || null;
          if (key !== null) text(key, 150);
          const result = await pool.query(`SELECT record_key AS "recordKey", name, status, updated_at AS "updatedAt"
            FROM opendesk_local_business_records WHERE business_id=$1 AND tenant_id=$2 AND subject_id=$3
            AND ($4::text IS NULL OR record_key=$4) ORDER BY record_key LIMIT 100`, [...scope(session.account), key]);
          return json({records:result.rows});
        }
        fail(404, 'E_ROUTE');
      } catch (error) {
        if (!res.headersSent) json({error:{code:error.status ? error.code : 'E_INTERNAL'}}, error.status || 500);
        else res.destroy();
      }
    };
  }
  const servers = [http.createServer(handler('portal')), http.createServer(handler('records'))];
  for (const server of servers) { server.requestTimeout = 10000; server.headersTimeout = 10000; }
  const close = async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    sessions.portal.clear(); sessions.records.clear();
  };
  try {
    for (const [index, port] of [portalPort, recordsPort].entries()) {
      await new Promise((resolve, reject) => {
        const server = servers[index];
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
      });
      if (index === 0) portalOrigin = `http://127.0.0.1:${servers[index].address().port}`;
      else recordsOrigin = `http://127.0.0.1:${servers[index].address().port}`;
    }
  } catch (error) { await close(); throw error; }
  return {businessId, portalOrigin, recordsOrigin,
    portalUrl:portalOrigin + '/', recordsUrl:recordsOrigin + '/',
    portalPort:servers[0].address().port, recordsPort:servers[1].address().port, close};
}
