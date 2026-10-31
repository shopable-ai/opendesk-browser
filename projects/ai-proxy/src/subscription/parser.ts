/** Pure, bounded syntax readers. No YAML resolver, constructors, or evaluation.
 * YAML subset: space-indented block maps/sequences; single-line flow maps/lists;
 * quoted strings, plain strings, booleans, null and decimal numbers. No multiline
 * scalars/flow collections, directives, document streams, tags, anchors or aliases.
 */
export const SUBSCRIPTION_ERROR_CODES = Object.freeze([
  'depth_limit', 'duplicate_key', 'empty_subscription', 'forbidden_feature', 'input_limit',
  'invalid_base64', 'invalid_encoding', 'invalid_fields', 'invalid_json', 'invalid_key',
  'invalid_port', 'invalid_report', 'invalid_server', 'invalid_subscription', 'invalid_uri',
  'invalid_yaml', 'node_limit', 'scalar_limit', 'unsafe_label', 'unsupported_fields', 'value_limit'
] as const);
export type SubscriptionErrorCode = typeof SUBSCRIPTION_ERROR_CODES[number];

export class SubscriptionParseError extends Error {
  readonly code: SubscriptionErrorCode;
  constructor(code: SubscriptionErrorCode) {
    // Runtime callers must not turn an arbitrary exception message into a diagnostic.
    if (!SUBSCRIPTION_ERROR_CODES.includes(code)) code = 'invalid_subscription';
    super(code);
    this.name = 'SubscriptionParseError';
    this.code = code;
  }
}
const LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, nodes: 500, depth: 24, values: 20000, scalar: 8192 });
function fail(code: SubscriptionErrorCode): never { throw new SubscriptionParseError(code); }
function validText(text: string): boolean {
  // Reject NUL, controls (except whitespace), unpaired UTF-16 and invisible direction controls.
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(text) &&
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
}
function checkKey(key: string): void {
  if (!validText(key) || key.length > 128) fail('invalid_key');
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  if (['__proto__', 'prototype', 'constructor', '<<'].includes(key) ||
      /provider|script|recursive/.test(normalized)) fail('forbidden_feature');
}
class Budget {
  count = 0;
  visit(depth: number): void {
    if (depth > LIMITS.depth) fail('depth_limit');
    if (++this.count > LIMITS.values) fail('value_limit');
  }
}

/** Unlike JSON.parse, rejects repeated keys (including escaped spellings). */
function strictJson(text: string): unknown {
  let pos = 0;
  const budget = new Budget();
  function ws() { while (/[ \t\r\n]/.test(text[pos] ?? '\0')) pos++; }
  function string(): string {
    const start = pos++;
    while (pos < text.length) {
      const c = text[pos++];
      if (c === '"') {
        let value: unknown;
        try { value = JSON.parse(text.slice(start, pos)); } catch { fail('invalid_json'); }
        if (typeof value !== 'string' || !validText(value)) fail('invalid_encoding');
        if (value.length > LIMITS.scalar) fail('scalar_limit');
        return value;
      }
      if (c === '\\') pos++;
    }
    return fail('invalid_json');
  }
  function value(depth: number): unknown {
    budget.visit(depth); ws();
    if (text[pos] === '"') return string();
    if (text[pos] === '{') {
      pos++; ws();
      const result: Record<string, unknown> = Object.create(null);
      if (text[pos] === '}') { pos++; return result; }
      while (pos < text.length) {
        if (text[pos] !== '"') fail('invalid_json');
        const key = string(); checkKey(key);
        if (Object.hasOwn(result, key)) fail('duplicate_key');
        ws(); if (text[pos++] !== ':') fail('invalid_json');
        result[key] = value(depth + 1); ws();
        const end = text[pos++];
        if (end === '}') return result;
        if (end !== ',') fail('invalid_json');
        ws();
      }
      fail('invalid_json');
    }
    if (text[pos] === '[') {
      pos++; ws(); const result: unknown[] = [];
      if (text[pos] === ']') { pos++; return result; }
      while (pos < text.length) {
        result.push(value(depth + 1)); ws();
        const end = text[pos++];
        if (end === ']') return result;
        if (end !== ',') fail('invalid_json');
      }
      fail('invalid_json');
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(pos));
    if (!literal) fail('invalid_json');
    pos += literal[0].length;
    const result: unknown = JSON.parse(literal[0]);
    if (typeof result === 'number' && !Number.isFinite(result)) fail('invalid_json');
    return result;
  }
  const result = value(1); ws();
  if (pos !== text.length) fail('invalid_json');
  return result;
}

type Line = { indent: number; text: string };
function restrictedYaml(text: string): unknown {
  const budget = new Budget();
  // Strip comments outside quotes. Refuse YAML semantic tokens outside quotes,
  // including on ignored configuration branches. Strings containing '&' remain data.
  const lines: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.includes('\t')) fail('invalid_yaml');
    let quote = '', end = raw.length;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i]!;
      if (quote) {
        if (quote === '"' && c === '\\') { i++; continue; }
        if (quote === "'" && c === "'" && raw[i + 1] === "'") { i++; continue; }
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]!))) { end = i; break; }
      else if (/[!&*]/.test(c) && (i === 0 || /[\s\[{,:]/.test(raw[i - 1]!))) fail('forbidden_feature');
    }
    if (quote) fail('invalid_yaml');
    const cleaned = raw.slice(0, end).trimEnd();
    if (!cleaned.trim()) continue;
    const content = cleaned.trimStart();
    if (/^(?:---|\.\.\.|%)/.test(content)) fail('invalid_yaml');
    lines.push({ indent: cleaned.length - content.length, text: content });
  }
  let cursor = 0;
  function scalar(source: string, depth: number): unknown {
    budget.visit(depth);
    if (source.startsWith('{') || source.startsWith('[')) return flow(source, depth);
    if (source.length > LIMITS.scalar) fail('scalar_limit');
    if (source.startsWith('"')) {
      let result: unknown;
      try { result = strictJson(source); } catch (error) {
        if (error instanceof SubscriptionParseError && error.code === 'invalid_encoding') throw error;
        return fail('invalid_yaml');
      }
      if (typeof result !== 'string') fail('invalid_yaml');
      return result;
    }
    if (source.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(source)) fail('invalid_yaml');
      return source.slice(1, -1).replace(/''/g, "'");
    }
    if (/[\[\]{}]/.test(source) || /^(?:[|>!?&*]|<<)/.test(source) || /:\s/.test(source)) fail('invalid_yaml');
    if (source === 'true') return true;
    if (source === 'false') return false;
    if (source === 'null' || source === '~') return null;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(source)) {
      const number = Number(source);
      if (!Number.isFinite(number)) fail('invalid_yaml');
      return number;
    }
    // Refuse ambiguous implicit YAML scalars (rather than silently coercing them).
    if (/^(?:yes|no|on|off|True|False|NULL|\.nan|[-+]?\.inf)$/i.test(source) ||
        /^[-+]?(?:0[xob]|0\d|\d+[eE]|\d[\d_]*_)/i.test(source) || /^\d{4}-\d\d-\d\d/.test(source)) fail('invalid_yaml');
    return source;
  }
  function key(source: string): string {
    const result = source.startsWith('"') || source.startsWith("'") ? scalar(source, 1) : source;
    if (typeof result !== 'string' || !result || (!source.startsWith('"') && !source.startsWith("'") && !/^[A-Za-z0-9_-]+$/.test(result))) fail('invalid_yaml');
    checkKey(result); return result;
  }
  function flow(source: string, depth: number): unknown {
    let p = 0;
    function ws() { while (source[p] === ' ') p++; }
    function atom(isKey = false): string {
      ws(); const start = p; let quote = '';
      while (p < source.length) {
        const c = source[p]!;
        if (quote) {
          p++;
          if (quote === '"' && c === '\\') p++;
          else if (quote === "'" && c === "'" && source[p] === "'") p++;
          else if (c === quote) quote = '';
        } else if (c === '"' || c === "'") { quote = c; p++; }
        else if (/[\[\]{},]/.test(c) || (isKey && c === ':')) break;
        else p++;
      }
      if (quote) fail('invalid_yaml');
      return source.slice(start, p).trim();
    }
    function item(d: number): unknown {
      ws();
      const open = source[p];
      if (open !== '{' && open !== '[') {
        const part = atom(); if (!part) fail('invalid_yaml');
        return scalar(part, d);
      }
      if (d !== depth) budget.visit(d); // scalar() already counted the root flow value
      p++; ws(); const close = open === '{' ? '}' : ']';
      const result: Record<string, unknown> | unknown[] = open === '{' ? Object.create(null) : [];
      if (source[p] === close) { p++; return result; }
      while (p < source.length) {
        if (Array.isArray(result)) result.push(item(d + 1));
        else {
          const k = key(atom(true));
          if (Object.hasOwn(result, k)) fail('duplicate_key');
          if (source[p++] !== ':') fail('invalid_yaml');
          result[k] = item(d + 1);
        }
        ws(); const end = source[p++];
        if (end === close) return result;
        if (end !== ',') fail('invalid_yaml');
        ws(); if (source[p] === close) fail('invalid_yaml');
      }
      return fail('invalid_yaml');
    }
    const result = item(depth); ws(); if (p !== source.length) fail('invalid_yaml');
    return result;
  }
  function pair(source: string): [string, string] {
    let quote = '';
    for (let p = 0; p < source.length; p++) {
      const c = source[p]!;
      if (quote) {
        if (quote === '"' && c === '\\') p++;
        else if (quote === "'" && c === "'" && source[p + 1] === "'") p++;
        else if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ':' && (p + 1 === source.length || source[p + 1] === ' ')) return [key(source.slice(0, p).trim()), source.slice(p + 1).trim()];
    }
    return fail('invalid_yaml');
  }
  function mapEntry(result: Record<string, unknown>, source: string, indent: number, depth: number) {
    const [k, rest] = pair(source);
    if (Object.hasOwn(result, k)) fail('duplicate_key');
    if (rest) result[k] = scalar(rest, depth + 1);
    else if (lines[cursor] && lines[cursor]!.indent > indent) result[k] = block(lines[cursor]!.indent, depth + 1);
    // Common Clash indentless sequence: proxies:\n- {...}
    else if (lines[cursor]?.indent === indent && /^-(?: |$)/.test(lines[cursor]!.text)) result[k] = block(indent, depth + 1);
    else { budget.visit(depth + 1); result[k] = null; }
  }
  function block(indent: number, depth: number): unknown {
    const first = lines[cursor]; if (!first) return null;
    if (first.text.startsWith('{') || first.text.startsWith('[')) {
      cursor++; return scalar(first.text, depth);
    }
    budget.visit(depth);
    const sequence = /^-(?: |$)/.test(first.text);
    const result: Record<string, unknown> | unknown[] = sequence ? [] : Object.create(null);
    while (lines[cursor]?.indent === indent) {
      const line = lines[cursor]!;
      const isSequence = /^-(?: |$)/.test(line.text);
      if (sequence !== isSequence) break;
      cursor++;
      if (Array.isArray(result)) {
        const rest = line.text.slice(1).trim();
        if (!rest) {
          if (!lines[cursor] || lines[cursor]!.indent <= indent) fail('invalid_yaml');
          result.push(block(lines[cursor]!.indent, depth + 1));
        } else if (rest.startsWith('{') || rest.startsWith('[') || !/:\s|:$/.test(rest)) result.push(scalar(rest, depth + 1));
        else {
          budget.visit(depth + 1);
          const entry: Record<string, unknown> = Object.create(null);
          // Inline block map after '- ' starts exactly two spaces deeper.
          mapEntry(entry, rest, indent + 2, depth + 1);
          while (lines[cursor]?.indent === indent + 2 && !/^-(?: |$)/.test(lines[cursor]!.text)) {
            mapEntry(entry, lines[cursor++]!.text, indent + 2, depth + 1);
          }
          result.push(entry);
        }
      } else mapEntry(result, line.text, indent, depth);
      if (lines[cursor] && lines[cursor]!.indent > indent) fail('invalid_yaml');
    }
    return result;
  }
  if (!lines.length || lines[0]!.indent !== 0) fail('invalid_yaml');
  const result = block(0, 1);
  if (cursor !== lines.length) fail('invalid_yaml');
  return result;
}

export interface SubscriptionNode {
  name: string;
  server: string;
  port: number;
  protocol: string;
  compatibility: 'chrome-native' | 'local-client' | 'unsupported';
  /** Static keys only; never exception messages or subscription content. */
  reason: string;
  scheme?: 'http' | 'https' | 'socks4' | 'socks5';
}
export interface SubscriptionReport {
  format: 'clash' | 'sing-box' | 'base64' | 'uri-list';
  nodes: SubscriptionNode[];
  invalidCount: number;
  /** Fixed codes only; omitted on legacy v1 reports whose reasons were not retained. */
  invalidReasons?: Partial<Record<SubscriptionErrorCode, number>>;
  duplicateCount: number;
  /** Counts retained nodes, after invalid rows and endpoint duplicates are removed. */
  protocols: Record<string, number>;
}

type Row = Record<string, unknown>;
const native = new Set(['http', 'https', 'socks4', 'socks5']);
const local = new Set(['ss', 'vmess', 'vless', 'trojan', 'hysteria2', 'tuic']);
const unsupported = new Set(['socks4a', 'wireguard', 'ssh', 'snell', 'hysteria', 'ssr', 'anytls', 'shadowtls', 'naive', 'unknown']);
const protocols = new Set([...native, ...local, ...unsupported]);
const secretsKey = /^(?:username|password|uuid|id|token|secret|authorization|cookie|auth|auth-str|obfs-password|private-key|private_key|pre-shared-key|pre_shared_key)$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const secretShape = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[0-9a-f]{32,}\b|\beyJ[A-Za-z0-9_-]+|(?:password|passwd|token|uuid|authorization|secret)\s*[:=]/i;
const ciphers = new Set(['aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305', 'xchacha20-ietf-poly1305',
  '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm', '2022-blake3-chacha20-poly1305', 'aes-128-cfb', 'aes-192-cfb', 'aes-256-cfb', 'chacha20-ietf', 'none']);

function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_fields');
  return value as Row;
}
function fields(row: Row, allowed: ReadonlySet<string>) {
  for (const key of Object.keys(row)) {
    checkKey(key);
    if (!allowed.has(key)) fail('unsupported_fields');
  }
}
function string(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || !value || value.length > max || !validText(value) || /[\r\n\t]/.test(value)) fail('invalid_fields');
  return value;
}
function port(value: unknown, decimalString = false): number {
  if (decimalString && typeof value === 'string' && /^(?:[1-9]\d{0,4})$/.test(value)) value = Number(value);
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) fail('invalid_port');
  return value;
}
function host(value: unknown): string {
  let result = string(value, 253);
  if (result !== result.trim() || /[%@/?#\\\s]/.test(result) || secretShape.test(result)) fail('invalid_server');
  if (result.startsWith('[') && result.endsWith(']')) result = result.slice(1, -1);
  if (result.includes(':')) {
    if (!/^[a-fA-F0-9:]+$/.test(result)) fail('invalid_server');
    try { result = new URL('http://[' + result + ']/').hostname.slice(1, -1); } catch { fail('invalid_server'); }
    return result;
  }
  result = result.toLowerCase().replace(/\.$/, '');
  if (!result || result.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) fail('invalid_server');
  if (/^[\d.]+$/.test(result)) {
    if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(result) || result.split('.').some(n => Number(n) > 255)) fail('invalid_server');
  } else {
    // WHATWG accepts hex/octal/shorthand IPv4; never normalize those into public hosts.
    try {
      const normalized = new URL('http://' + result + '/').hostname;
      if (normalized !== result) fail('invalid_server');
    } catch { fail('invalid_server'); }
  }
  return result;
}
/** Syntactic public-address check only. No DNS resolution or network authorization. */
function publicHost(server: string): boolean {
  if (server.includes(':')) {
    // Conservatively allow only global unicast, excluding special/documentation ranges
    // and transition ranges that embed another address (mapped, NAT64, 6to4, Teredo).
    const parts = server.split(':'), first = Number.parseInt(parts[0]!, 16);
    const second = Number.parseInt(parts[1] || '0', 16);
    return first >= 0x2000 && first < 0x3fff && first !== 0x2002 &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
  }
  if (/^\d+\./.test(server) && /^[\d.]+$/.test(server)) {
    const [a, b, c] = server.split('.').map(Number) as [number, number, number];
    return server !== '168.63.129.16' && a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 100 && b >= 64 && b <= 127) &&
      !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) &&
      !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) && !(a === 203 && b === 0 && c === 113);
  }
  return server.includes('.') && !/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(server) &&
    !/(?:^|\.)(?:home\.arpa|in-addr\.arpa|ip6\.arpa)$/.test(server);
}
function cleanLabel(value: unknown, fallback: string, secrets: ReadonlySet<string>): string {
  if (value === undefined) return fallback;
  const result = string(value, 80).trim();
  if (!result || /[@:/\\?=&%#\r\n\t]/.test(result) || secretShape.test(result) || /[A-Za-z0-9_+-]{32,}/.test(result) ||
      /\b(?:bearer|password|passwd|token|authorization|uuid)\b/i.test(result)) fail('unsafe_label');
  if ([...secrets].some(secret => result.includes(secret))) fail('unsafe_label');
  return result;
}
function checkSecretServer(server: string, secrets: ReadonlySet<string>) {
  if ([...secrets].some(secret => server.includes(secret.toLowerCase()))) fail('unsafe_label');
}
function collectSecrets(value: unknown, result: Set<string>, depth = 1): void {
  if (depth > LIMITS.depth) fail('depth_limit');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    checkKey(key);
    if ((secretsKey.test(key) || (key === 'type' && typeof child === 'string' && !protocols.has(child.toLowerCase()) &&
      !['shadowsocks', 'socks', 'hy2', 'tcp', 'ws', 'grpc', 'http', 'h2', 'httpupgrade', 'quic', 'kcp'].includes(child.toLowerCase()))) && typeof child === 'string' && child) {
      result.add(child);
      // Encoded credentials are not safe display names either.
      result.add(encodeURIComponent(child));
      const encoded = btoa(Array.from(new TextEncoder().encode(child), byte => String.fromCharCode(byte)).join(''));
      result.add(encoded); result.add(encoded.replace(/=+$/, ''));
      const urlEncoded = encoded.replace(/\+/g, '-').replace(/\//g, '_');
      result.add(urlEncoded); result.add(urlEncoded.replace(/=+$/, ''));
    }
    collectSecrets(child, result, depth + 1);
  }
}
function decoded(value: string): string {
  let result: string;
  try { result = decodeURIComponent(value); } catch { return fail('invalid_encoding'); }
  if (!validText(result) || /[\r\n\t]/.test(result)) fail('invalid_encoding');
  return result;
}
function base64(value: string): string {
  if (!value || value.length > LIMITS.bytes * 2 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value) ||
      (/[+\/]/.test(value) && /[-_]/.test(value))) fail('invalid_base64');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const bare = normalized.replace(/=+$/, '');
  if (bare.length % 4 === 1 || (normalized.includes('=') && normalized.length % 4 !== 0)) fail('invalid_base64');
  let binary: string;
  try { binary = atob(bare); } catch { return fail('invalid_base64'); }
  if (btoa(binary).replace(/=+$/, '') !== bare) fail('invalid_base64');
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  let result: string;
  try { result = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return fail('invalid_encoding'); }
  if (!validText(result)) fail('invalid_encoding');
  return result;
}
function normalizeProtocol(value: unknown, form: 'clash' | 'sing-box'): string {
  const p = string(value, 32).toLowerCase();
  if (form === 'sing-box' && p === 'shadowsocks') return 'ss';
  if (p === 'hy2') return 'hysteria2';
  return protocols.has(p) ? p : 'unknown';
}

const booleanKeys = new Set(['udp', 'tls', 'skip-cert-verify', 'tfo', 'mptcp', 'udp-over-tcp', 'global-padding', 'authenticated-length',
  'disable_sni', 'insecure', 'enabled', 'fast-open', 'lazy', 'reduce-rtt', 'zero-rtt-handshake', 'ip_version', 'udp_fragment', 'tcp_fast_open', 'tcp_multi_path']);
const stringKeys = new Set(['username', 'password', 'uuid', 'cipher', 'method', 'network', 'servername', 'sni', 'client-fingerprint', 'fingerprint',
  'flow', 'packet-encoding', 'obfs', 'obfs-password', 'auth', 'auth-str', 'token', 'interface-name', 'ip-version', 'congestion-controller',
  'udp-relay-mode', 'up', 'down', 'plugin', 'plugin_opts', 'detour', 'bind_interface', 'inet4_bind_address', 'inet6_bind_address',
  'domain_strategy', 'server_name', 'security', 'packet_encoding', 'congestion_control', 'uuid', 'private-key', 'public-key', 'pre-shared-key', 'version',
  'headerType', 'quicSecurity', 'pcs']);
const numericKeys = new Set(['alterId', 'alter_id', 'routing-mark', 'connect_timeout', 'routing_mark', 'heartbeat-interval', 'heartbeat', 'mtu']);
const listKeys = new Set(['alpn', 'ports']);
const mapKeys = new Set(['ws-opts', 'h2-opts', 'grpc-opts', 'http-opts', 'reality-opts', 'smux', 'plugin-opts', 'transport', 'multiplex', 'obfs', 'udp_over_tcp', 'tls']);
const clashBase = ['name', 'type', 'server', 'port', 'udp', 'tfo', 'mptcp', 'interface-name', 'routing-mark', 'ip-version'];
const singBase = ['tag', 'type', 'server', 'server_port', 'detour', 'bind_interface', 'inet4_bind_address', 'inet6_bind_address', 'routing_mark',
  'reuse_addr', 'connect_timeout', 'tcp_fast_open', 'tcp_multi_path', 'udp_fragment', 'domain_strategy', 'network', 'tls', 'transport', 'multiplex'];
const auth = ['username', 'password'];
const tls = ['tls', 'servername', 'sni', 'skip-cert-verify', 'alpn', 'client-fingerprint', 'fingerprint'];
const transports = ['network', 'ws-opts', 'h2-opts', 'grpc-opts', 'http-opts', 'reality-opts', 'smux'];
const perProtocol: Record<string, string[]> = {
  http: [...auth, ...tls, ...transports, 'headers'], https: [...auth, ...tls, ...transports, 'headers'], socks4: [...auth, ...tls],
  socks5: [...auth, ...tls, 'udp-over-tcp', 'udp_over_tcp', 'version'], socks4a: [...auth, 'version'],
  ss: ['password', 'cipher', 'method', 'plugin', 'plugin-opts', 'plugin_opts', 'udp-over-tcp', 'udp_over_tcp', ...transports],
  vmess: ['uuid', 'alterId', 'alter_id', 'cipher', 'security', 'global-padding', 'authenticated-length', 'packet-encoding', 'packet_encoding', ...tls, ...transports],
  vless: ['uuid', 'flow', 'packet-encoding', 'packet_encoding', ...tls, ...transports],
  trojan: ['password', ...tls, ...transports],
  hysteria2: ['password', 'auth', 'auth-str', 'obfs', 'obfs-password', 'up', 'down', 'ports', 'mport', ...tls],
  tuic: ['uuid', 'password', 'token', 'congestion-controller', 'congestion_control', 'udp-relay-mode', 'disable-sni', 'reduce-rtt', 'fast-open',
    'heartbeat-interval', 'heartbeat', 'zero-rtt-handshake', ...tls],
  wireguard: ['private-key', 'public-key', 'pre-shared-key', 'mtu'], ssh: [...auth, 'private-key'], snell: ['password', 'version'],
  hysteria: ['auth', 'auth-str', 'up', 'down', ...tls], ssr: ['password', 'cipher', 'obfs'], anytls: ['password', ...tls],
  shadowtls: ['password', 'version', ...tls], naive: [...auth, ...tls], unknown: []
};
const nestedAllowed = new Set(['type', 'enabled', 'server_name', 'disable_sni', 'insecure', 'alpn', 'min_version', 'max_version', 'cipher_suites',
  'certificate', 'certificate_path', 'utls', 'reality', 'fingerprint', 'public_key', 'short_id', 'path', 'headers', 'Host', 'host', 'method',
  'service_name', 'service-name', 'idle_timeout', 'ping_timeout', 'permit_without_stream', 'max_early_data', 'early_data_header_name',
  'max-early-data', 'early-data-header-name', 'grpc-service-name', 'http-upgrade', 'v2ray-http-upgrade', 'protocol', 'max_connections',
  'min_streams', 'max_streams', 'padding', 'brutal', 'up_mbps', 'down_mbps', 'password', 'mode', 'obfs', 'obfs-host', 'tls', 'skip-cert-verify',
  'public-key', 'short-id', 'client-fingerprint', 'ech', 'config', 'config_path']);
function validateNested(value: unknown, depth = 1): void {
  if (depth > LIMITS.depth) fail('depth_limit');
  if (Array.isArray(value)) {
    if (value.length > 64) fail('invalid_fields');
    for (const item of value) string(item);
  } else if (value && typeof value === 'object') {
    const row = object(value); fields(row, nestedAllowed);
    for (const [key, child] of Object.entries(row)) {
      if (['enabled', 'disable_sni', 'insecure', 'permit_without_stream', 'padding', 'tls', 'skip-cert-verify', 'http-upgrade', 'v2ray-http-upgrade'].includes(key)) {
        if (typeof child !== 'boolean') fail('invalid_fields');
      } else if (key === 'headers') validateHeaders(child);
      else if (['utls', 'reality', 'brutal', 'ech'].includes(key)) validateNested(object(child), depth + 1);
      else if (Array.isArray(child)) validateNested(child, depth + 1);
      else if (['max_connections', 'min_streams', 'max_streams', 'max_early_data', 'max-early-data', 'up_mbps', 'down_mbps'].includes(key)) {
        if (!Number.isSafeInteger(child) || Number(child) < 0) fail('invalid_fields');
      } else string(child);
    }
  } else fail('invalid_fields');
}
function validateHeaders(value: unknown): void {
  for (const [key, child] of Object.entries(object(value))) {
    checkKey(key);
    if (!/^[A-Za-z0-9-]{1,80}$/.test(key)) fail('invalid_fields');
    if (Array.isArray(child)) validateNested(child);
    else string(child);
  }
}
function validateOptions(row: Row, form: 'clash' | 'sing-box') {
  for (const [key, value] of Object.entries(row)) {
    if (['name', 'tag', 'server', 'port', 'server_port', 'type'].includes(key)) continue;
    if (mapKeys.has(key) && value && typeof value === 'object') validateNested(value);
    else if (booleanKeys.has(key) || ['disable-sni', 'reuse_addr'].includes(key)) {
      if (typeof value !== 'boolean') fail('invalid_fields');
    } else if (stringKeys.has(key)) string(value);
    else if (numericKeys.has(key)) {
      if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 65535) fail('invalid_fields');
    } else if (['ports', 'mport'].includes(key) && form === 'clash' && typeof value === 'string') {
      // Mihomo Hysteria2 uses a comma-separated port/range string, not a YAML list.
      portRanges(string(value));
    } else if (key === 'mport') {
      fail('invalid_fields');
    } else if (listKeys.has(key)) {
      if (!Array.isArray(value)) fail('invalid_fields');
      validateNested(value);
    } else if (key === 'headers') validateHeaders(value);
    else if (mapKeys.has(key)) fail('invalid_fields');
    // Only explicitly allowlisted options reach this data-only fallback.
    else if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) continue;
    else if (typeof value === 'string') { if (value) string(value); }
    else validateData(value);
  }
}
function validateData(value: unknown): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
  if (typeof value === 'string') { if (value) string(value); return; }
  if (Array.isArray(value)) { for (const child of value) validateData(child); return; }
  for (const [key, child] of Object.entries(object(value))) { checkKey(key); validateData(child); }
}
function credentials(row: Row, protocol: string) {
  if (protocol === 'ss') {
    const method = string(row.cipher ?? row.method, 80);
    if (!ciphers.has(method)) fail('invalid_fields');
    string(row.password);
    if (method.startsWith('2022-')) {
      const expected = method.includes('128') ? 16 : 32;
      for (const piece of string(row.password).split(':')) {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(piece)) fail('invalid_fields');
        let binary: string;
        try { binary = atob(piece); } catch { return fail('invalid_fields'); }
        if (binary.length !== expected || btoa(binary) !== piece) fail('invalid_fields');
      }
    }
  } else if (['vmess', 'vless', 'tuic'].includes(protocol)) {
    // TUIC v4 token and v5 UUID/password are mutually exclusive.
    if (protocol === 'tuic' && row.token !== undefined) {
      if (Object.hasOwn(row, 'uuid') || Object.hasOwn(row, 'password')) fail('invalid_fields');
      string(row.token);
    }
    else {
      if (!uuid.test(string(row.uuid, 36))) fail('invalid_fields');
      if (protocol === 'tuic') string(row.password);
    }
  } else if (protocol === 'trojan' || protocol === 'hysteria2') string(row.password ?? row.auth ?? row['auth-str']);
}
function makeNode(row: Row, protocol: string, form: 'clash' | 'sing-box', index: number, secrets: ReadonlySet<string>): SubscriptionNode {
  const server = host(row.server), endpointPort = port(form === 'clash' ? row.port : row.server_port);
  checkSecretServer(server, secrets);
  const name = cleanLabel(form === 'clash' ? row.name : row.tag, protocol.toUpperCase() + ' ' + (index + 1), secrets);
  let reason = 'unsupported_protocol', compatibility: SubscriptionNode['compatibility'] = 'unsupported';
  if (local.has(protocol)) { compatibility = 'local-client'; reason = 'protocol_requires_local_client'; }
  if (native.has(protocol)) {
    compatibility = 'chrome-native'; reason = 'native_proxy';
    const hasAuth = ['username', 'password', 'uuid', 'token', 'auth'].some(key => Object.hasOwn(row, key));
    const identity = new Set(form === 'clash' ? ['name', 'type', 'server', 'port'] : ['tag', 'type', 'server', 'server_port']);
    if (form === 'sing-box' && row.type === 'socks') identity.add('version');
    const customized = Object.keys(row).some(key => !identity.has(key) && !['username', 'password'].includes(key));
    if (hasAuth) { compatibility = 'local-client'; reason = 'authentication_required'; }
    else if (customized) { compatibility = 'local-client'; reason = 'custom_transport'; }
    else if (!publicHost(server)) { compatibility = 'local-client'; reason = 'non_public_endpoint'; }
    else if (server.includes(':')) { compatibility = 'local-client'; reason = 'ipv6_requires_local_client'; }
  }
  return { name, server, port: endpointPort, protocol, compatibility, reason,
    ...(native.has(protocol) ? { scheme: protocol as SubscriptionNode['scheme'] } : {}) };
}
function configNode(raw: unknown, form: 'clash' | 'sing-box', index: number, secrets: ReadonlySet<string>): SubscriptionNode {
  const row = object(raw), protocol = normalizeProtocol(row.type, form);
  // sing-box socks uses a version field; no version means SOCKS5.
  let effective = protocol;
  if (form === 'sing-box' && row.type === 'socks') {
    if (row.version !== undefined && !['4', '4a', '5'].includes(row.version as string)) fail('invalid_fields');
    effective = row.version === '4a' ? 'socks4a' : row.version === '4' ? 'socks4' : 'socks5';
  }
  const allowed = new Set([...(form === 'clash' ? clashBase : singBase), ...(perProtocol[effective] ?? []),
    ...(form === 'sing-box' && row.type === 'socks' ? ['version'] : [])]);
  for (const key of Object.keys(row)) {
    checkKey(key);
    // Opposite-format identity fields are errors, not silent aliases.
    if (!allowed.has(key) && ['port', 'server_port', 'name', 'tag'].includes(key)) fail('invalid_fields');
    if (!allowed.has(key)) fail('unsupported_fields');
  }
  // Numeric SOCKS versions are not part of sing-box's schema.
  validateOptions(row, form); credentials(row, effective);
  if (effective === 'http' && (row.tls === true || (row.tls && typeof row.tls === 'object' && !Array.isArray(row.tls) && (row.tls as Row).enabled === true))) effective = 'https';
  return makeNode(row, effective, form, index, secrets);
}

const reservedQuery = new Set(['server', 'port', 'server_port', 'name', 'tag', 'protocol', 'compatibility', 'reason', 'scheme',
  'username', 'password', 'uuid', 'token', 'auth', 'cipher', 'method']);
const uriQuery = new Set(['allowInsecure', 'insecure', 'skip-cert-verify', 'tls', 'disable_sni', 'reduce_rtt', 'udp', 'tfo', 'mptcp',
  'security', 'type', 'encryption', 'sni', 'servername', 'alpn', 'fp', 'flow', 'host', 'path', 'serviceName', 'mode',
  'pbk', 'sid', 'spx', 'obfs', 'obfs-password', 'pinSHA256', 'ports', 'up', 'down', 'congestion_control', 'udp_relay_mode',
  'heartbeat', 'plugin', 'headerType', 'quicSecurity', 'pcs', 'mport']);
const emptyUriValues = new Set(['host', 'path', 'serviceName']);
function portRanges(value: string): void {
  if (!/^[1-9]\d{0,4}(?:-[1-9]\d{0,4})?(?:,[1-9]\d{0,4}(?:-[1-9]\d{0,4})?)*$/.test(value)) fail('invalid_fields');
  for (const range of value.split(',')) {
    const [start, end = start] = range.split('-');
    if (port(start, true) > port(end, true)) fail('invalid_fields');
  }
}
type UriEntry = { row: Row; protocol: string };
function uriEntry(uri: string, secrets: Set<string>): UriEntry {
  if (uri.length > LIMITS.scalar) fail('scalar_limit');
  if (/\s/.test(uri) || !validText(uri)) fail('invalid_uri');
  const match = /^([a-zA-Z][a-zA-Z0-9+-]*):\/\/(.*)$/.exec(uri);
  if (!match) fail('invalid_uri');
  const scheme = match[1]!.toLowerCase();
  const protocol = scheme === 'hy2' ? 'hysteria2' : protocols.has(scheme) ? scheme : 'unknown';
  if (scheme === 'vmess') {
    const row = object(strictJson(base64(match[2]!)));
    collectSecrets(row, secrets);
    fields(row, new Set(['v', 'ps', 'add', 'port', 'id', 'aid', 'scy', 'net', 'type', 'host', 'path', 'tls', 'sni', 'alpn', 'fp']));
    if (row.v !== undefined && row.v !== '2' && row.v !== 2) fail('invalid_fields');
    if (row.aid !== undefined && !(typeof row.aid === 'number' && Number.isInteger(row.aid) && row.aid >= 0 && row.aid <= 65535) &&
        !(typeof row.aid === 'string' && /^(?:0|[1-9]\d{0,4})$/.test(row.aid) && Number(row.aid) <= 65535)) fail('invalid_fields');
    for (const key of ['scy', 'net', 'type', 'host', 'path', 'tls', 'sni', 'alpn', 'fp']) if (row[key] !== undefined && typeof row[key] !== 'string') fail('invalid_fields');
    const converted: Row = { type: 'vmess', server: row.add, port: port(row.port, true), uuid: row.id,
      ...(row.ps === undefined || row.ps === '' ? {} : { name: row.ps }) };
    return { row: converted, protocol };
  }
  // Validate percent escapes before WHATWG could retain or normalize malformed input.
  decoded(match[2]!);
  const hashes = match[2]!.split('#');
  if (hashes.length > 2) fail('invalid_uri');
  let body = hashes[0]!;
  const name = hashes.length === 2 ? decoded(hashes[1]!) : undefined;
  const question = body.indexOf('?');
  const query = question < 0 ? '' : body.slice(question + 1);
  body = question < 0 ? body : body.slice(0, question);
  const options: Row = Object.create(null);
  const queryKeys = new Set<string>();
  if (question >= 0) {
    if (!query) fail('invalid_uri');
    for (const part of query.split('&')) {
      const eq = part.indexOf('=');
      if (eq <= 0) fail('invalid_fields');
      const key = decoded(part.slice(0, eq)), value = decoded(part.slice(eq + 1));
      checkKey(key);
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) || reservedQuery.has(key)) fail('invalid_fields');
      if (value || !emptyUriValues.has(key)) string(value);
      if (queryKeys.has(key)) fail('duplicate_key');
      queryKeys.add(key);
      if (['allowInsecure', 'insecure', 'skip-cert-verify', 'tls', 'disable_sni', 'reduce_rtt', 'udp', 'tfo', 'mptcp'].includes(key) && !['0', '1', 'true', 'false'].includes(value)) fail('invalid_fields');
      if (key === 'security' && !['none', 'tls', 'reality'].includes(value)) fail('invalid_fields');
      if (key === 'type' && !['tcp', 'ws', 'grpc', 'http', 'h2', 'httpupgrade', 'quic', 'kcp'].includes(value)) fail('invalid_fields');
      if (key === 'encryption' && value !== 'none') fail('invalid_fields');
      if (['ports', 'mport'].includes(key)) portRanges(value);
      // 'type' is a transport query, not a replacement for the protocol field.
      options[key === 'type' ? 'network' : key] = value;
    }
  }
  if (body.endsWith('/')) body = body.slice(0, -1);
  // SIP002 and legacy SS: base64(method:password)@host, plain AEAD-2022
  // credentials, or base64(method:password@host:port). Never use a URL resolver.
  const legacySs = protocol === 'ss' && !body.includes('@');
  if (legacySs) body = base64(decoded(body));
  const at = body.lastIndexOf('@');
  let userinfo = at < 0 ? undefined : body.slice(0, at);
  const address = at < 0 ? body : body.slice(at + 1);
  if (userinfo?.includes('@') && !legacySs) fail('invalid_uri');
  const row: Row = { type: protocol,
    ...(name === undefined || name === '' ? {} : { name }), ...options };
  if (userinfo !== undefined) {
    if (!userinfo) fail('invalid_fields');
    if (protocol === 'ss') {
      // SIP002 userinfo is percent-decoded before deciding whether it is base64.
      // Legacy decoded data is already a credential string, not another URI layer.
      if (!legacySs) userinfo = decoded(userinfo);
      if (!userinfo.includes(':')) userinfo = base64(userinfo);
      const colon = userinfo.indexOf(':');
      if (colon < 1) fail('invalid_fields');
      row.cipher = userinfo.slice(0, colon); row.password = userinfo.slice(colon + 1);
    } else if (protocol === 'vless') row.uuid = decoded(userinfo);
    else if (protocol === 'trojan' || protocol === 'hysteria2') row.password = decoded(userinfo);
    else if (protocol === 'tuic') {
      const colon = userinfo.indexOf(':');
      if (colon < 0) row.token = decoded(userinfo);
      else {
        if (colon < 1) fail('invalid_fields');
        row.uuid = decoded(userinfo.slice(0, colon)); row.password = decoded(userinfo.slice(colon + 1));
      }
    } else {
      const colon = userinfo.indexOf(':');
      row.username = decoded(colon < 0 ? userinfo : userinfo.slice(0, colon));
      if (colon >= 0) row.password = decoded(userinfo.slice(colon + 1));
      string(row.username); if (Object.hasOwn(row, 'password')) string(row.password);
    }
  }
  collectSecrets(row, secrets);
  // Rejected rows must still prevent other rows from echoing their credentials.
  if ([...queryKeys].some(key => !uriQuery.has(key))) fail('unsupported_fields');
  // Match the address structure independently; port() owns every port rejection.
  const endpoint = /^(\[[a-fA-F0-9:]+\]|[^:/@?#\\]+):([^:/@?#\\]*)$/.exec(address);
  if (!endpoint) fail('invalid_uri');
  row.server = host(endpoint[1]); row.port = port(endpoint[2], true);
  return { row, protocol };
}

function structural(error: unknown): SubscriptionErrorCode {
  if (!(error instanceof SubscriptionParseError)) fail('invalid_subscription');
  if (['depth_limit', 'value_limit', 'node_limit', 'scalar_limit', 'duplicate_key', 'forbidden_feature'].includes(error.code)) throw error;
  return error.code;
}
function report(format: SubscriptionReport['format'], rows: unknown[], convert: (row: unknown, index: number) => SubscriptionNode): SubscriptionReport {
  if (rows.length > LIMITS.nodes) fail('node_limit');
  const invalidReasons: Partial<Record<SubscriptionErrorCode, number>> = {};
  const result: SubscriptionReport = { format, nodes: [], invalidCount: 0, invalidReasons, duplicateCount: 0, protocols: {} };
  const identities = new Map<string, SubscriptionNode>();
  rows.forEach((raw, index) => {
    let node: SubscriptionNode;
    try { node = convert(raw, index); } catch (error) {
      const code = structural(error);
      result.invalidCount++; invalidReasons[code] = (invalidReasons[code] ?? 0) + 1; return;
    }
    const identity = node.protocol + '|' + node.server + '|' + node.port;
    const previous = identities.get(identity);
    if (previous) {
      result.duplicateCount++;
      // Conflicting endpoint rows must never promote a customized proxy to native.
      if (previous.compatibility === 'chrome-native' && node.compatibility !== 'chrome-native') {
        previous.compatibility = 'local-client'; previous.reason = 'duplicate_configuration';
      }
      return;
    }
    identities.set(identity, node); result.nodes.push(node);
    result.protocols[node.protocol] = (result.protocols[node.protocol] ?? 0) + 1;
  });
  return result;
}
const clashRoot = new Set(['proxies', 'proxy-groups', 'rules', 'dns', 'mode', 'log-level', 'ipv6', 'port', 'socks-port', 'mixed-port', 'redir-port',
  'tproxy-port', 'allow-lan', 'bind-address', 'authentication', 'external-controller', 'secret', 'profile', 'tun', 'hosts', 'unified-delay',
  'tcp-concurrent', 'geodata-mode', 'geodata-loader', 'geo-auto-update', 'geo-update-interval', 'global-client-fingerprint', 'find-process-mode']);
const singRoot = new Set(['outbounds', 'log', 'dns', 'route', 'inbounds', 'experimental', 'ntp']);

/** Offline inspection only. Never fetches, executes, stores or returns credentials.
 * Syntax errors/ambiguous keys fail the document; invalid individual rows are counted.
 * Limits apply before deduplication. Public-host status is syntactic, not a DNS/SSRF gate.
 */
export function parseSubscription(text: string): SubscriptionReport {
  try { return parse(text); } catch (error) {
    if (error instanceof SubscriptionParseError) throw error;
    // Built-in parser/URI exception messages may contain secrets: never propagate them.
    return fail('invalid_subscription');
  }
}
function parse(input: string): SubscriptionReport {
  if (typeof input !== 'string') fail('invalid_subscription');
  if (input.length > LIMITS.bytes || new TextEncoder().encode(input).byteLength > LIMITS.bytes) fail('input_limit');
  const text = input.replace(/^\ufeff/, '').trim();
  if (!text) fail('empty_subscription');
  if (!validText(text)) fail('invalid_encoding');
  const first = text.split(/\r?\n/).find(line => line.trim() && !line.trimStart().startsWith('#'))?.trimStart() ?? '';
  if (first.startsWith('{') || first.startsWith('[') || /^(?:proxies|[A-Za-z_-]+):(?:\s|$)/.test(first) || /^(?:---|%|[!&*])/.test(first)) {
    const json = first.startsWith('{') || first.startsWith('[');
    // Root flow YAML maps with bare keys are recognized as Clash; malformed JSON
    // beginning with a quoted key never gets a fallback that could hide duplicate keys.
    const flowYaml = first.startsWith('{') && /^\{\s*[A-Za-z_-]+\s*:/.test(first);
    const root = object(json && !flowYaml ? strictJson(text) : restrictedYaml(text));
    const form = Object.hasOwn(root, 'outbounds') ? 'sing-box' : 'clash';
    fields(root, form === 'clash' ? clashRoot : singRoot);
    const rows = root[form === 'clash' ? 'proxies' : 'outbounds'];
    if (!Array.isArray(rows)) fail('invalid_subscription');
    if (rows.length > LIMITS.nodes) fail('node_limit');
    const secrets = new Set<string>(); collectSecrets(root, secrets);
    return report(form, rows, (raw, index) => configNode(raw, form, index, secrets));
  }
  let format: SubscriptionReport['format'] = 'uri-list', list = text;
  if (!/^[a-zA-Z][a-zA-Z0-9+-]*:\/\//m.test(text)) {
    list = base64(text.replace(/[\r\n]/g, ''));
    format = 'base64';
    if (!/^[a-zA-Z][a-zA-Z0-9+-]*:\/\//m.test(list)) fail('invalid_subscription');
  }
  const entries = list.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (entries.length > LIMITS.nodes) fail('node_limit');
  if (!entries.length) fail('empty_subscription');
  // Two passes so an earlier label cannot expose a later row's credential.
  const parsed: (UriEntry | SubscriptionErrorCode)[] = [];
  const secrets = new Set<string>();
  for (const entry of entries) {
    try { const item = uriEntry(entry, secrets); parsed.push(item); }
    catch (error) { parsed.push(structural(error)); }
  }
  return report(format, parsed, (item, index) => {
    if (typeof item === 'string') fail(item as SubscriptionErrorCode);
    const { row, protocol } = item as UriEntry;
    credentials(row, protocol);
    const effective = protocol === 'http' && (row.tls === 'true' || row.tls === '1' || row.security === 'tls') ? 'https' : protocol;
    return makeNode(row, effective, 'clash', index, secrets);
  });
}

/** Strict shape boundary for display-only sanitized reports. Omitted original
 * authentication/transport data cannot be verified, so self-reported native
 * compatibility NEVER confers permission to create a Chrome endpoint.
 */
export function validateSubscriptionReport(input: unknown): SubscriptionReport {
  try { return validateReport(input); } catch { return fail('invalid_report'); }
}
/** Strictly read envelopes before duplicate-key and resource-budget enforcement.
 * null means ordinary JSON which should be parsed as a subscription instead.
 */
export function parseSubscriptionReport(text: string): SubscriptionReport | null {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > LIMITS.bytes) fail('input_limit');
  if (!validText(text)) fail('invalid_encoding');
  const root = object(strictJson(text));
  if (!Object.hasOwn(root, 'schema') && !Object.hasOwn(root, 'report')) return null;
  try { fields(root, new Set(['schema', 'report'])); } catch { return fail('invalid_report'); }
  if (root.schema !== 'ai-proxy-subscription-report-v1' || !Object.hasOwn(root, 'report')) fail('invalid_report');
  return validateSubscriptionReport(root.report);
}
function dataObject(input: unknown, allowed: ReadonlySet<string>): Row {
  const row = object(input);
  if (![Object.prototype, null].includes(Object.getPrototypeOf(row))) fail('invalid_report');
  const descriptors = Object.getOwnPropertyDescriptors(row);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !allowed.has(key))) fail('invalid_report');
  for (const descriptor of Object.values(descriptors)) if (!('value' in descriptor) || !descriptor.enumerable) fail('invalid_report');
  return row;
}
function validateReport(input: unknown): SubscriptionReport {
  const row = dataObject(input, new Set(['format', 'nodes', 'invalidCount', 'invalidReasons', 'duplicateCount', 'protocols']));
  if (typeof row.format !== 'string' || !['clash', 'sing-box', 'base64', 'uri-list'].includes(row.format)) fail('invalid_report');
  if (!Array.isArray(row.nodes) || row.nodes.length > LIMITS.nodes || Object.getPrototypeOf(row.nodes) !== Array.prototype) fail('invalid_report');
  // Reject array accessors, sparse arrays and hidden/symbol properties before reading.
  const arrayDescriptors = Object.getOwnPropertyDescriptors(row.nodes);
  if (Reflect.ownKeys(arrayDescriptors).length !== row.nodes.length + 1) fail('invalid_report');
  for (let i = 0; i < row.nodes.length; i++) if (!arrayDescriptors[String(i)] || !('value' in arrayDescriptors[String(i)]!)) fail('invalid_report');
  for (const count of [row.invalidCount, row.duplicateCount]) if (!Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > LIMITS.nodes) fail('invalid_report');
  if (row.nodes.length + Number(row.invalidCount) + Number(row.duplicateCount) > LIMITS.nodes) fail('invalid_report');
  let invalidReasons: SubscriptionReport['invalidReasons'];
  if (Object.hasOwn(row, 'invalidReasons')) {
    const declaredReasons = dataObject(row.invalidReasons, new Set(SUBSCRIPTION_ERROR_CODES));
    invalidReasons = {};
    let total = 0;
    for (const [key, count] of Object.entries(declaredReasons)) {
      if (!Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > LIMITS.nodes) fail('invalid_report');
      total += Number(count);
      invalidReasons[key as SubscriptionErrorCode] = Number(count);
    }
    if (total !== row.invalidCount) fail('invalid_report');
  }
  const seen = new Set<string>(), counts: Record<string, number> = {};
  const nodes = row.nodes.map(raw => {
    const node = dataObject(raw, new Set(['name', 'server', 'port', 'protocol', 'compatibility', 'reason', 'scheme']));
    const protocol = string(node.protocol, 32);
    if (!protocols.has(protocol)) fail('invalid_report');
    const server = host(node.server), endpointPort = port(node.port);
    if (server !== node.server || cleanLabel(node.name, '', new Set()) !== node.name) fail('invalid_report');
    const identity = protocol + '|' + server + '|' + endpointPort;
    if (seen.has(identity)) fail('invalid_report');
    seen.add(identity); counts[protocol] = (counts[protocol] ?? 0) + 1;
    const compatibility = node.compatibility, reason = node.reason;
    if (typeof compatibility !== 'string' || typeof reason !== 'string') fail('invalid_report');
    if (native.has(protocol)) {
      if (node.scheme !== protocol) fail('invalid_report');
      if (compatibility === 'chrome-native') {
        if (reason !== 'native_proxy' || !publicHost(server)) fail('invalid_report');
      } else if (compatibility === 'local-client') {
        if (!['authentication_required', 'custom_transport', 'non_public_endpoint', 'duplicate_configuration', 'report_requires_original', 'ipv6_requires_local_client'].includes(reason)) fail('invalid_report');
        if (reason === 'non_public_endpoint' && publicHost(server)) fail('invalid_report');
        if (reason === 'ipv6_requires_local_client' && !server.includes(':')) fail('invalid_report');
      } else fail('invalid_report');
    } else {
      if (Object.hasOwn(node, 'scheme')) fail('invalid_report');
      if (local.has(protocol)) {
        if (compatibility !== 'local-client' || reason !== 'protocol_requires_local_client') fail('invalid_report');
      } else if (compatibility !== 'unsupported' || reason !== 'unsupported_protocol') fail('invalid_report');
    }
    return { name: node.name as string, server, port: endpointPort, protocol,
      compatibility: compatibility === 'chrome-native' ? 'local-client' : compatibility,
      reason: compatibility === 'chrome-native' ? 'report_requires_original' : reason,
      ...(native.has(protocol) ? { scheme: protocol as SubscriptionNode['scheme'] } : {}) } as SubscriptionNode;
  });
  const declared = dataObject(row.protocols, protocols);
  if (Object.keys(declared).length !== Object.keys(counts).length || Object.entries(declared).some(([key, count]) => count !== counts[key])) fail('invalid_report');
  return { format: row.format as SubscriptionReport['format'], nodes, invalidCount: row.invalidCount as number,
    ...(invalidReasons === undefined ? {} : { invalidReasons }), duplicateCount: row.duplicateCount as number, protocols: counts };
}
