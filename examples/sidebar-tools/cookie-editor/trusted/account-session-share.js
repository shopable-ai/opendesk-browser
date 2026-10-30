// Fixed first-party SW helper for the original Cookie Share Relay. The parent
// owns read/change/request, their durable receipts, authorization and lifecycle
// lock. No Host, network client, state service or native Cookie writer here.
import {cookieShareAddress} from './account-share.js';
import {FoundationError} from '../../../../src/platform/protocol.js';

const ID = /^[A-Za-z0-9_-]{22,80}$/, FP = /^[a-f0-9]{64}$/;
const fail = code => new FoundationError(code, code);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => a === b || Boolean(object(a) && object(b) &&
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]))) ||
  Boolean(Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i])));
const fingerprint = value => {
  if (typeof value !== 'string' || !FP.test(value)) throw fail('E_SESSION_FINGERPRINT_REQUIRED');
  return value;
};

function metadata(row) {
  if (!object(row) || typeof row.id !== 'string' || !ID.test(row.id) || row.mode !== 'session' ||
      typeof row.displayName !== 'string' || !row.displayName.trim() || row.displayName.length > 64 ||
      typeof row.description !== 'string' || row.description.length > 120 ||
      /[\x00-\x1f\x7f]/.test(row.displayName + row.description) ||
      !Number.isSafeInteger(row.expiresAt) || row.expiresAt <= 0 ||
      !Number.isSafeInteger(row.remainingClaims) || row.remainingClaims < 0 || row.remainingClaims > 1 ||
      typeof row.revoked !== 'boolean' || typeof row.origin !== 'string' || row.origin.length > 320)
    throw fail('E_SHARE_RESPONSE');
  let site;
  try { site = new URL(row.origin); } catch { throw fail('E_SHARE_RESPONSE'); }
  if (!['https:', 'http:'].includes(site.protocol) || site.origin !== row.origin || site.username || site.password)
    throw fail('E_SHARE_RESPONSE');
  return {id: row.id, origin: row.origin, displayName: row.displayName.trim(), description: row.description,
    mode: 'session', expiresAt: row.expiresAt, remainingClaims: row.remainingClaims, revoked: row.revoked};
}
const sameInvitation = (a, b) => ['id', 'origin', 'displayName', 'description', 'mode', 'expiresAt']
  .every(key => a[key] === b[key]);
function publicFields(value) {
  if (!object(value) || value.kty !== 'EC' || value.crv !== 'P-256' || Object.hasOwn(value, 'd') ||
      typeof value.x !== 'string' || typeof value.y !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.x) || !/^[A-Za-z0-9_-]{43}$/.test(value.y))
    throw fail('E_SESSION_PUBLIC_KEY');
  return {kty: 'EC', crv: 'P-256', x: value.x, y: value.y};
}
function packetFields(value) {
  if (!object(value) || typeof value.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(value.iv) ||
      typeof value.ciphertext !== 'string' || value.ciphertext.length < 23 || value.ciphertext.length > 682688 ||
      !/^[A-Za-z0-9_-]+$/.test(value.ciphertext)) throw fail('E_SESSION_PACKET');
  return {senderPublic: publicFields(value.senderPublic), iv: value.iv, ciphertext: value.ciphertext};
}
const deliveryReceipt = row => ({status: 'encrypted_ready', requestId: row.requestId,
  senderFingerprint: fingerprint(row.senderFingerprint)});

// mapSnapshot(snapshot) -> validated Cookie[]; it must use the existing Cookie
// service's receiving document/Store/Partition/site scope and may reject. keys
// is already bound to this installation's owner and the parent's authorize.
export function createCookieAccountSessionShare({read, change, request, vault, authorize,
  keys, sessionCrypto, mapSnapshot, validateSnapshot}) {
  async function state() {
    const value = await read();
    if (value?.format !== 1 || !Array.isArray(value.items) || !Array.isArray(value.claims) ||
        value.items.length > 32 || value.claims.length > 48) throw fail('E_SHARE_STORAGE');
    return value;
  }
  function claimIdentity(row, payload, owner) {
    const address = cookieShareAddress(payload.inviteUrl, {invitation: true});
    if (!row || row.owner !== owner || row.url !== address.url || row.mode !== 'session')
      throw fail('E_SHARE_NOT_FOUND');
    const invite = metadata(row.invite);
    if (invite.id !== address.id) throw fail('E_SHARE_STORAGE');
    if (invite.origin !== payload.origin) throw fail('E_SITE_MISMATCH');
    return {address, invite};
  }
  async function updateClaim(prior, patch) {
    return change(value => {
      const row = value.claims.find(x => x.ref === prior.ref && x.owner === prior.owner && x.url === prior.url);
      if (!row || !same(row, prior)) throw fail('E_OUTCOME_UNKNOWN');
      Object.assign(row, patch); return row;
    });
  }
  async function live(address, origin, prior) {
    const invite = metadata(await request(address.origin, '/v1/invites/' + address.id));
    if (invite.id !== address.id) throw fail('E_SHARE_RESPONSE');
    if (invite.origin !== origin) throw fail('E_SITE_MISMATCH');
    if (prior && !sameInvitation(invite, metadata(prior))) throw fail('E_SHARE_RESPONSE');
    if (invite.revoked) throw fail('E_INVITE_REVOKED');
    if (invite.expiresAt <= Date.now()) throw fail('E_INVITE_EXPIRED');
    if (invite.remainingClaims < 1) throw fail('E_INVITE_CONSUMED');
    return invite;
  }
  async function receiverKeys(row) {
    // Only the first preparation uses create(). A missing key after restart
    // is loss of the paired identity, never an instruction to generate one.
    if (row.phase !== 'preparing' &&
        (typeof row.receiverFingerprint !== 'string' || !FP.test(row.receiverFingerprint)))
      throw fail('E_SHARE_STORAGE');
    const receiver = await keys.open(row.receiverKeyId, 'ECDH');
    const signing = await keys.open(row.verifyKeyId, 'ECDSA');
    const ecdhPublic = await sessionCrypto.publicJwk(receiver.publicKey);
    const verifyPublic = await sessionCrypto.publicJwk(signing.publicKey);
    const receiverFingerprint = await sessionCrypto.deviceFingerprint(ecdhPublic, verifyPublic);
    if (row.receiverFingerprint && row.receiverFingerprint !== receiverFingerprint)
      throw fail('E_SESSION_RECEIVER_MISMATCH');
    return {receiver, signing, ecdhPublic, verifyPublic, receiverFingerprint};
  }
  function projection(row) {
    return {url: row.url, invite: metadata(row.invite), sessionAvailable: true,
      pair: row.requestId ? {requestId: row.requestId, receiverFingerprint: fingerprint(row.receiverFingerprint)} : null,
      sessionImported: row.phase === 'applied', localSavePending: row.phase === 'received',
      ...(['received', 'applied'].includes(row.phase) ? {senderFingerprint: fingerprint(row.expectedSenderFingerprint)} : {}),
      cookieWriteVerified: false, websiteLoginConfirmed: false};
  }
  async function appliedAccount(row) {
    const data = await vault.read();
    if (!data.accounts.some(a => a.alias === row.alias && a.origin === row.invite.origin))
      throw fail('E_ACCOUNT_NOT_FOUND');
    await authorize();
  }
  async function inspect(prior, payload, owner) {
    await authorize();
    if (prior?.mode !== 'session' && prior?.invite?.mode !== 'session') return null;
    claimIdentity(prior, payload, owner);
    const row = (await state()).claims.find(x => x.ref === prior.ref && x.owner === owner && x.url === prior.url);
    claimIdentity(row, payload, owner);
    if (!['preparing', 'prepared', 'paired', 'received', 'applied'].includes(row.phase))
      throw fail('E_OUTCOME_UNKNOWN');
    if (row.phase === 'applied') await appliedAccount(row);
    await authorize(); return projection(row);
  }
  async function pair(payload, owner) {
    const address = cookieShareAddress(payload.inviteUrl, {invitation: true});
    let prior = (await state()).claims.find(x => x.url === address.url && x.owner === owner);
    if (prior) {
      claimIdentity(prior, payload, owner);
      if (['received', 'applied'].includes(prior.phase)) return inspect(prior, payload, owner);
      if (prior.phase === 'paired') {
        await receiverKeys(prior); await authorize(); return projection(prior);
      }
      if (!['preparing', 'prepared'].includes(prior.phase)) throw fail('E_OUTCOME_UNKNOWN');
    }
    // Including an explicit retry after an unsent POST: use live availability,
    // never the cached remainingClaims from the original pairing receipt.
    const invite = await live(address, payload.origin, prior?.invite);
    let created = false;
    if (!prior) {
      prior = await change(value => {
        if (value.claims.length >= 48) throw fail('E_SHARE_LIMIT');
        if (value.claims.some(x => x.owner === owner && x.url === address.url)) throw fail('E_OUTCOME_UNKNOWN');
        const ref = crypto.randomUUID();
        const row = {ref, owner, url: address.url, mode: 'session', invite, phase: 'preparing',
          alias: 'acct_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20),
          receiverKeyId: 'share_receive_' + ref, verifyKeyId: 'share_verify_' + ref};
        value.claims.push(row); return row;
      });
      created = true;
    }
    if (created) {
      await keys.create(prior.receiverKeyId, 'ECDH'); await keys.create(prior.verifyKeyId, 'ECDSA');
    }
    const identity = await receiverKeys(prior);
    prior = await updateClaim(prior, {phase: 'prepared', invite, receiverFingerprint: identity.receiverFingerprint});
    prior = await updateClaim(prior, {phase: 'pairing'});
    let result;
    try {
      result = await request(address.origin, '/v1/invites/' + address.id + '/pair', {
        body: {ecdhPublic: identity.ecdhPublic, verifyPublic: identity.verifyPublic}});
    } catch (error) {
      if (error?.shareRequestUnsent === true) await updateClaim(prior, {phase: 'prepared'});
      throw error;
    }
    if (typeof result?.requestId !== 'string' || !ID.test(result.requestId) || result.expiresAt !== invite.expiresAt)
      throw fail('E_OUTCOME_UNKNOWN');
    prior = await updateClaim(prior, {phase: 'paired', requestId: result.requestId});
    await authorize(); return projection(prior);
  }
  async function ownedItem(payload, owner) {
    const row = (await state()).items.find(x => x.ref === payload.ref && x.owner === owner);
    if (!row || typeof row.id !== 'string' || !ID.test(row.id) ||
        typeof row.managerSecret !== 'string' || !ID.test(row.managerSecret)) throw fail('E_SHARE_NOT_FOUND');
    if (row.siteOrigin !== payload.origin) throw fail('E_SITE_MISMATCH');
    const invite = metadata(row.invite), address = cookieShareAddress(row.url, {invitation: true});
    if (address.origin !== row.relay || address.id !== row.id || invite.id !== row.id || invite.origin !== row.siteOrigin)
      throw fail('E_SHARE_STORAGE');
    return row;
  }
  async function pairsFor(row) {
    const result = await request(row.relay, '/v1/invites/' + row.id + '/pairs', {secret: row.managerSecret});
    if (!Array.isArray(result?.requests) || result.requests.length > 20) throw fail('E_SHARE_RESPONSE');
    const seen = new Set(), pairs = [];
    for (const item of result.requests) {
      if (!object(item) || typeof item.requestId !== 'string' || !ID.test(item.requestId) || seen.has(item.requestId) ||
          !['pending', 'ready', 'claimed'].includes(item.status) ||
          !Number.isSafeInteger(item.createdAt) || item.createdAt <= 0) throw fail('E_SHARE_RESPONSE');
      seen.add(item.requestId);
      const ecdhPublic = publicFields(item.ecdhPublic), verifyPublic = publicFields(item.verifyPublic);
      const receiverFingerprint = await sessionCrypto.deviceFingerprint(ecdhPublic, verifyPublic);
      pairs.push({requestId: item.requestId, status: item.status, createdAt: item.createdAt,
        receiverFingerprint, ecdhPublic});
    }
    await authorize(); return pairs;
  }
  async function deliveryChange(item, prior, patch) {
    // change() readbacks compare whole items/claims; return the parent item,
    // never a nested delivery that the original receipt cannot establish.
    const changed = await change(value => {
      const row = value.items.find(x => x.ref === item.ref && x.owner === item.owner);
      if (!row || row.phase !== 'active' || row.alias !== item.alias || row.siteOrigin !== item.siteOrigin ||
          row.accountVersion !== item.accountVersion || row.managerSecret !== item.managerSecret ||
          row.url !== item.url || !sameInvitation(metadata(row.invite), metadata(item.invite)))
        throw fail('E_OUTCOME_UNKNOWN');
      if (row.deliveries !== undefined && (!Array.isArray(row.deliveries) || row.deliveries.length > 20))
        throw fail('E_SHARE_STORAGE');
      row.deliveries ??= [];
      const current = row.deliveries.find(x => x.requestId === (prior?.requestId ?? patch.requestId));
      if (prior ? !same(current, prior) : current !== undefined) throw fail('E_OUTCOME_UNKNOWN');
      if (prior) Object.assign(current, patch);
      else {
        if (row.deliveries.length >= 20) throw fail('E_SHARE_LIMIT');
        row.deliveries.push(patch);
      }
      return row;
    });
    return changed.deliveries.find(x => x.requestId === (prior?.requestId ?? patch.requestId));
  }
  async function sourceSnapshot(item, payload) {
    const data = await vault.read();
    if (!Number.isSafeInteger(payload.revision) || data.revision !== payload.revision) throw fail('E_VAULT_CONFLICT');
    const account = data.accounts.find(a => a.alias === item.alias && a.origin === item.siteOrigin);
    if (!account || !Number.isSafeInteger(item.accountVersion) || account.version !== item.accountVersion)
      throw fail('E_VAULT_CONFLICT');
    if (!Array.isArray(account.cookies) || !account.cookies.length) throw fail('E_ACCOUNT_EMPTY');
    const snapshot = {format: 1, origin: account.origin, cookies: account.cookies};
    await validateSnapshot(snapshot);
    await authorize();
    return snapshot;
  }
  async function deliver(payload, owner) {
    const receiverFingerprint = fingerprint(payload.receiverFingerprint);
    if (typeof payload.requestId !== 'string' || !ID.test(payload.requestId)) throw fail('E_SESSION_PAIR_NOT_FOUND');
    const item = await ownedItem(payload, owner);
    if (item.deliveries !== undefined && (!Array.isArray(item.deliveries) || item.deliveries.length > 20))
      throw fail('E_SHARE_STORAGE');
    let prior = item.deliveries?.find(x => x.requestId === payload.requestId);
    if (prior) {
      if (prior.receiverFingerprint !== receiverFingerprint) throw fail('E_SESSION_RECEIVER_MISMATCH');
      if (prior.phase === 'delivered') { await authorize(); return deliveryReceipt(prior); }
      if (!['preparing', 'prepared'].includes(prior.phase)) throw fail('E_OUTCOME_UNKNOWN');
    }
    if (item.phase !== 'active') throw fail('E_OUTCOME_UNKNOWN');
    const pairs = await pairsFor(item), selected = pairs.find(x => x.requestId === payload.requestId);
    if (!selected) throw fail('E_SESSION_PAIR_NOT_FOUND');
    if (selected.receiverFingerprint !== receiverFingerprint) throw fail('E_SESSION_RECEIVER_MISMATCH');
    if (selected.status !== 'pending') throw fail('E_OUTCOME_UNKNOWN');
    let snapshot = await sourceSnapshot(item, payload), created = false;
    if (!prior) {
      prior = await deliveryChange(item, null, {requestId: selected.requestId, receiverFingerprint,
        senderKeyId: 'share_send_' + crypto.randomUUID(), phase: 'preparing'});
      created = true;
    }
    if (created) await keys.create(prior.senderKeyId, 'ECDH');
    const sender = await keys.open(prior.senderKeyId, 'ECDH');
    prior = await deliveryChange(item, prior, {phase: 'prepared'});
    const encrypted = await sessionCrypto.encrypt({snapshot, sender, receiverPublic: selected.ecdhPublic,
      context: {inviteId: item.id, requestId: selected.requestId, origin: item.siteOrigin, receiverFingerprint}});
    // Key preparation/encryption may yield to other writes. Recheck the source
    // revision immediately before installing the durable outbound fence.
    const current = await sourceSnapshot(item, payload);
    if (!same(snapshot, current)) throw fail('E_VAULT_CONFLICT');
    snapshot = null;
    prior = await deliveryChange(item, prior, {phase: 'delivering', senderFingerprint: encrypted.senderFingerprint});
    let result;
    try {
      result = await request(item.relay, '/v1/invites/' + item.id + '/deliver', {
        secret: item.managerSecret, body: {requestId: selected.requestId, ...encrypted.packet}});
    } catch (error) {
      if (error?.shareRequestUnsent === true) await deliveryChange(item, prior, {phase: 'prepared'});
      throw error;
    }
    if (result?.status !== 'encrypted_ready' || result.requestId !== selected.requestId) throw fail('E_OUTCOME_UNKNOWN');
    prior = await deliveryChange(item, prior, {phase: 'delivered'});
    await authorize(); return deliveryReceipt(prior);
  }
  async function imported(row) {
    await appliedAccount(row);
    const status = await vault.status(); await authorize();
    return {...status, status: 'session_imported', alias: row.alias, sessionImported: true,
      cookieWriteVerified: false, websiteLoginConfirmed: false};
  }
  async function claim(payload, owner) {
    const senderFingerprint = fingerprint(payload.senderFingerprint);
    const address = cookieShareAddress(payload.inviteUrl, {invitation: true});
    let prior = (await state()).claims.find(x => x.url === address.url && x.owner === owner);
    const {invite} = claimIdentity(prior, payload, owner);
    if (prior.phase !== 'received' && prior.expectedSenderFingerprint &&
        prior.expectedSenderFingerprint !== senderFingerprint)
      throw fail('E_SESSION_SENDER_MISMATCH');
    if (prior.phase === 'applied') return imported(prior);
    if (!['paired', 'received'].includes(prior.phase)) throw fail('E_OUTCOME_UNKNOWN');
    if (typeof prior.requestId !== 'string' || !ID.test(prior.requestId)) throw fail('E_SHARE_STORAGE');
    const before = await vault.read();
    if (!Number.isSafeInteger(payload.revision) || before.revision !== payload.revision) throw fail('E_VAULT_CONFLICT');
    if (before.accounts.length >= 48 && !before.accounts.some(a => a.alias === prior.alias)) throw fail('E_SHARE_LIMIT');
    const identity = await receiverKeys(prior);
    if (prior.phase === 'paired') {
      await live(address, payload.origin, invite);
      prior = await updateClaim(prior, {phase: 'claiming'});
      let challengeSent = false, result;
      try {
        const challenge = await request(address.origin, '/v1/invites/' + address.id + '/challenge', {
          body: {requestId: prior.requestId}});
        challengeSent = true;
        if (typeof challenge?.challenge !== 'string' || !ID.test(challenge.challenge) ||
            !Number.isSafeInteger(challenge.expiresAt) || challenge.expiresAt <= Date.now())
          throw fail('E_OUTCOME_UNKNOWN');
        const signature = await sessionCrypto.signClaim({privateKey: identity.signing.privateKey,
          inviteId: address.id, requestId: prior.requestId, challenge: challenge.challenge});
        result = await request(address.origin, '/v1/invites/' + address.id + '/claim', {
          body: {requestId: prior.requestId, challenge: challenge.challenge, signature}, sessionClaim: true});
      } catch (error) {
        // Even an unsent second POST cannot undo a challenge that was sent.
        if (!challengeSent && error?.shareRequestUnsent === true)
          await updateClaim(prior, {phase: 'paired'});
        throw error;
      }
      let received, encryptedPacket;
      try {
        received = metadata(result?.account); encryptedPacket = packetFields(result?.packet);
        if (result.status !== 'encrypted_claimed' || !sameInvitation(received, invite) || received.revoked)
          throw fail('E_SHARE_RESPONSE');
      } catch { throw fail('E_OUTCOME_UNKNOWN'); }
      prior = await updateClaim(prior, {phase: 'received', invite: received,
        encryptedPacket, expectedSenderFingerprint: senderFingerprint});
    }
    const snapshot = await sessionCrypto.decrypt({packet: prior.encryptedPacket, receiver: identity.receiver,
      expectedSenderFingerprint: senderFingerprint,
      context: {inviteId: address.id, requestId: prior.requestId, origin: invite.origin,
        receiverFingerprint: prior.receiverFingerprint}});
    await authorize();
    // Only an authenticated local received packet may accept a corrected human
    // review. Compare the entire durable receipt before changing its fingerprint;
    // no pairing, challenge or claim is repeated to repair a typing mistake.
    if (prior.expectedSenderFingerprint !== senderFingerprint)
      prior = await updateClaim(prior, {expectedSenderFingerprint: senderFingerprint});
    const cookies = await mapSnapshot(snapshot);
    if (!Array.isArray(cookies) || cookies.length < 1 || cookies.length > 100 || cookies.some(x => !object(x)))
      throw fail('E_ACCOUNT_COOKIE_SCOPE');
    await authorize();
    await vault.update(payload.revision, async data => {
      await authorize();
      const used = new Set(data.accounts.filter(a => a.origin === invite.origin && a.alias !== prior.alias)
        .map(a => a.displayName));
      let displayName = invite.displayName;
      for (let n = 2; used.has(displayName); n++) displayName = invite.displayName.slice(0, 52) + '（领取 ' + n + '）';
      const account = {alias: prior.alias, origin: invite.origin, displayName, description: invite.description,
        cookies, version: 1, allowAuto: false};
      const existing = data.accounts.find(x => x.alias === prior.alias);
      if (existing) {
        if (!same(existing, account)) throw fail('E_VAULT_CONFLICT');
        return; // A previously committed local save may have lost its receipt.
      }
      if (data.accounts.length >= 48) throw fail('E_SHARE_LIMIT');
      data.accounts.push(account);
    });
    prior = await updateClaim(prior, {phase: 'applied'});
    return imported(prior);
  }
  async function dispatch(action, payload, owner) {
    await authorize();
    if (!object(payload) || typeof owner !== 'string' || !owner) throw fail('E_ACCOUNT_REQUEST');
    if (action === 'sharePair') return pair(payload, owner);
    if (action === 'sharePairs') {
      const item = await ownedItem(payload, owner);
      if (item.phase !== 'active') throw fail('E_OUTCOME_UNKNOWN');
      const rows = await pairsFor(item);
      if (item.deliveries !== undefined && (!Array.isArray(item.deliveries) || item.deliveries.length > 20))
        throw fail('E_SHARE_STORAGE');
      return {pairs: rows.map(({requestId, receiverFingerprint, status, createdAt}) => {
        const receipt = item.deliveries?.find(x => x.requestId === requestId && x.phase === 'delivered' &&
          x.receiverFingerprint === receiverFingerprint);
        return {requestId, receiverFingerprint, status, createdAt,
          ...(receipt ? {senderFingerprint: fingerprint(receipt.senderFingerprint)} : {})};
      })};
    }
    if (action === 'shareDeliver') return deliver(payload, owner);
    if (action === 'shareClaim') return claim(payload, owner);
    throw fail('E_ACCOUNT_REQUEST');
  }
  return Object.freeze({dispatch, inspect});
}
