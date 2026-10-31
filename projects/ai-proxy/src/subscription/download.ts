export const SUBSCRIPTION_DOWNLOAD_MAX_BYTES = 1024 * 1024;
export const SUBSCRIPTION_DOWNLOAD_TIMEOUT_MS = 15000;
export const SUBSCRIPTION_DOWNLOAD_MAX_URL_LENGTH = 8192;

export const SUBSCRIPTION_DOWNLOAD_ERROR_CODES = Object.freeze([
  'invalid-url', 'origin-mismatch', 'fetch-failed', 'timeout', 'redirect-refused',
  'http-error', 'response-too-large', 'empty-response', 'encoding-invalid'
] as const);
export type SubscriptionDownloadErrorCode = typeof SUBSCRIPTION_DOWNLOAD_ERROR_CODES[number];

export class SubscriptionDownloadError extends Error {
  readonly code: SubscriptionDownloadErrorCode;
  constructor(code: SubscriptionDownloadErrorCode) {
    super(code);
    this.name = 'SubscriptionDownloadError';
    this.code = code;
  }
}

type DownloadOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};

function fail(code: SubscriptionDownloadErrorCode): never {
  throw new SubscriptionDownloadError(code);
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

function isIPv4(hostname: string): boolean {
  return /^\d+(?:\.\d+){3}$/.test(hostname) && hostname.split('.').every(part => {
    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255;
  });
}

function isPrivateLookingHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host.includes('.') || host.includes(':') || isIPv4(host) || /^\d+$/.test(host)) return true;
  if (/(^|\.)localhost$|(^|\.)local$|(^|\.)internal$|(^|\.)invalid$|(^|\.)test$|(^|\.)lan$|(^|\.)home$|(^|\.)intranet$/.test(host))
    return true;
  return host === 'metadata.google.internal' || host === '169.254.169.254' || host.endsWith('.arpa');
}

function isSafeUrlInput(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.length > 0 && trimmed.length <= SUBSCRIPTION_DOWNLOAD_MAX_URL_LENGTH &&
    trimmed.length === input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '').length &&
    !/[\u0000-\u001f\u007f\s]/u.test(trimmed);
}

export function validateSubscriptionUrlShape(input: string): URL {
  if (!isSafeUrlInput(input)) fail('invalid-url');
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { fail('invalid-url'); }
  const actualHost = normalizeHost(url.hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      (url.port && url.port !== '443') || isPrivateLookingHost(actualHost)) fail('invalid-url');
  return url;
}

export function validateSubscriptionDownloadUrl(input: string, originHost: string): URL {
  const expectedHost = normalizeHost(originHost);
  const url = validateSubscriptionUrlShape(input);
  const actualHost = normalizeHost(url.hostname);
  if (actualHost !== expectedHost) fail('origin-mismatch');
  return url;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function fixedError(error: unknown, signal: AbortSignal): SubscriptionDownloadError {
  if (error instanceof SubscriptionDownloadError) return error;
  return signal.aborted || isAbortError(error)
    ? new SubscriptionDownloadError('timeout')
    : new SubscriptionDownloadError('fetch-failed');
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array> | null): Promise<void> {
  if (!reader) return;
  try { await reader.cancel(); } catch { /* best effort: keep original fixed error */ }
}

function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function downloadSubscriptionText(
  input: string,
  originHost: string,
  options: DownloadOptions = {}
): Promise<string> {
  const url = validateSubscriptionDownloadUrl(input, originHost);
  const maxBytes = options.maxBytes ?? SUBSCRIPTION_DOWNLOAD_MAX_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? SUBSCRIPTION_DOWNLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url.href, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'manual',
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    throw fixedError(error, controller.signal);
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
      fail('redirect-refused');
    if (!response.ok) fail('http-error');
    const length = response.headers.get('content-length');
    if (length && Number(length) > maxBytes) fail('response-too-large');
    reader = response.body?.getReader() ?? null;
    if (!reader) fail('fetch-failed');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await readChunk(reader, controller.signal);
      if (done) break;
      if (value) {
        bytes += value.byteLength;
        if (bytes > maxBytes) fail('response-too-large');
        chunks.push(value);
      }
    }
    if (bytes === 0) fail('empty-response');
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(body); }
    catch { fail('encoding-invalid'); }
  } catch (error) {
    const wrapped = fixedError(error, controller.signal);
    controller.abort();
    await cancelReader(reader);
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}
