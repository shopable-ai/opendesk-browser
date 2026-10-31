// Business data only. Runtime ownership/active status never belongs in a backup.
function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function object(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('E_CONFIG', `${label} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) fail('E_UNSUPPORTED', `${label}: unsupported field ${key}; auth/PAC/runtime data cannot be imported`);
  }
  return value;
}

function id(value) {
  if (typeof value !== 'string' || !/^[\w-]{1,80}$/.test(value)) fail('E_CONFIG', 'Invalid profile ID');
  return value;
}

function host(value) {
  if (typeof value !== 'string' || value.length > 253 || !value ||
      !value.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) {
    fail('E_CONFIG', 'Use a public lowercase ASCII DNS name without URL, wildcard, credentials or path');
  }
  if (!value.includes('.') || /^[\d.]+$/.test(value) ||
      /(?:^|\.)(?:localhost|local|internal|private|lan|home|arpa)$/.test(value)) {
    fail('E_CONFIG', 'Public ASCII DNS required; IP addresses, localhost and private/local DNS names are not supported');
  }
  return value;
}

export function validateProfile(raw) {
  const x = object(raw, ['id', 'name', 'scheme', 'host', 'port', 'domains'], 'Profile');
  if (!['https', 'socks5'].includes(x.scheme)) fail('E_UNSUPPORTED', 'Only https and socks5 are supported; http, socks4 and PAC cannot be downgraded');
  if (typeof x.name !== 'string' || !x.name.trim() || x.name.length > 80) fail('E_CONFIG', 'Name must contain 1–80 characters');
  if (!Number.isInteger(x.port) || x.port < 1 || x.port > 65535) fail('E_CONFIG', 'Port must be an integer from 1 to 65535');
  if (!Array.isArray(x.domains) || x.domains.length < 1 || x.domains.length > 16) fail('E_CONFIG', 'Choose 1–16 domains');
  const domains = x.domains.map(value => host(value));
  if (new Set(domains).size !== domains.length) fail('E_CONFIG', 'Duplicate domain');
  return { id: id(x.id), name: x.name.trim(), scheme: x.scheme, host: host(x.host), port: x.port, domains };
}

export function createConfig() {
  return { schemaVersion: 2, profiles: [], selectedProfileId: null };
}

export function detectImportFormat(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'unknown';
  if (raw.schemaVersion === 2 && ('endpoints' in raw || 'sources' in raw || 'defaultTarget' in raw)) return 'legacy-v2';
  if (raw.schemaVersion === 1 && Array.isArray(raw.proxies)) return 'legacy-v1';
  if (raw.schemaVersion === 2 && Array.isArray(raw.profiles)) return 'managed-v2';
  return 'unknown';
}

export function validateConfig(raw) {
  if (detectImportFormat(raw).startsWith('legacy-')) {
    fail('E_LEGACY_FORMAT', 'Recognized legacy AI Proxy backup: endpoints/rules/PAC/auth require explicit migration; no data was imported');
  }
  const x = object(raw, ['schemaVersion', 'profiles', 'selectedProfileId'], 'Config');
  if (x.schemaVersion !== 2 || !Array.isArray(x.profiles) || x.profiles.length > 200) fail('E_CONFIG', 'Invalid schemaVersion 2 configuration');
  const profiles = x.profiles.map(validateProfile);
  if (new Set(profiles.map(p => p.id)).size !== profiles.length) fail('E_CONFIG', 'Duplicate profile ID');
  if (x.selectedProfileId !== null && !profiles.some(p => p.id === x.selectedProfileId)) fail('E_CONFIG', 'Selected profile does not exist');
  return { schemaVersion: 2, profiles, selectedProfileId: x.selectedProfileId };
}

export function createDraft(config, profileId = null, newId) {
  const saved = validateConfig(config);
  if (profileId === null) return { editingId: null, profile: { id: id(newId), name: '', scheme: 'https', host: '', port: 443, domains: [] } };
  const profile = saved.profiles.find(p => p.id === profileId);
  if (!profile) fail('E_CONFIG', 'Profile does not exist');
  return { editingId: profileId, profile };
}

export function saveDraft(config, draft) {
  const saved = validateConfig(config);
  object(draft, ['editingId', 'profile'], 'Draft');
  const profile = validateProfile(draft.profile);
  if (draft.editingId === null) {
    if (saved.profiles.some(p => p.id === profile.id)) fail('E_CONFIG', 'Profile ID already exists');
    saved.profiles.push(profile);
  } else {
    const index = saved.profiles.findIndex(p => p.id === draft.editingId);
    if (index < 0 || profile.id !== draft.editingId) fail('E_CONFIG', 'Edited profile reference is invalid');
    saved.profiles[index] = profile;
  }
  return validateConfig(saved);
}

export function cancelDraft(config) { return validateConfig(config); }

export function selectProfile(config, profileId) {
  return validateConfig({ ...validateConfig(config), selectedProfileId: profileId });
}

export function importConfig(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { fail('E_CONFIG', 'Invalid backup JSON'); }
  return validateConfig(raw);
}

export function exportConfig(config) { return JSON.stringify(validateConfig(config), null, 2); }

export function toManagedConfig(profile) {
  const { scheme, host, port, domains } = validateProfile(profile);
  return { endpoint: { scheme, host, port }, domains };
}
