import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {validateAlias} from './domain.mjs';
const fail = () => Object.assign(new Error('E_AUTH_REQUIRED'), {code: 'E_AUTH_REQUIRED'});
const AUTH = 'https://api.openai.com/auth';
const PROFILE = 'https://api.openai.com/profile';
const MAX = 128 * 1024;
const claims = token => {
  if (typeof token !== 'string' || token.length > 32768 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw fail();
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
};
export function codexAuthFileSource({alias, path} = {}) {
  if (!validateAlias(alias) || typeof path !== 'string' || !isAbsolute(path)) throw fail();
  return async requestedAlias => {
    if (requestedAlias !== alias) throw fail();
    let file;
    try {
      file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = await file.stat();
      if (!stat.isFile() || (stat.mode & 0o177) !== 0 ||
          (typeof process.getuid === 'function' && stat.uid !== process.getuid()) || stat.size < 2 || stat.size > MAX) throw fail();
      const bytes = Buffer.alloc(MAX + 1);
      let size = 0;
      while (size < bytes.length) {
        const {bytesRead} = await file.read(bytes, size, bytes.length - size, null);
        if (!bytesRead) break;
        size += bytesRead;
      }
      if (size > MAX) throw fail();
      const auth = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, size)));
      if (auth.auth_mode !== 'chatgpt' || !auth.tokens) throw fail();
      const {access_token, id_token, account_id} = auth.tokens;
      const access = claims(access_token), identity = claims(id_token);
      const userId = identity[AUTH]?.chatgpt_user_id, accountId = identity[AUTH]?.chatgpt_account_id;
      const email = identity.email ?? identity[PROFILE]?.email;
      const accessEmail = access.email ?? access[PROFILE]?.email;
      if (typeof userId !== 'string' || !userId || typeof accountId !== 'string' || !accountId ||
          accountId !== account_id || access[AUTH]?.chatgpt_user_id !== userId || access[AUTH]?.chatgpt_account_id !== accountId ||
          identity.sub !== access.sub || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email) ||
          typeof accessEmail !== 'string' || email.toLowerCase() !== accessEmail.toLowerCase()) throw fail();
      return {alias, authorized: true, snapshot: {authMode: 'chatgpt', accessToken: access_token, idToken: id_token, accountId},
        expectedIdentity: {userId, accountId, email}};
    } catch { throw fail(); } finally { await file?.close(); }
  };
}
