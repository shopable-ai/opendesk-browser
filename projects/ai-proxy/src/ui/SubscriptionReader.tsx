import {getEnvironment} from '../environment';
import {Button} from '@opendesk/ui';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { endpointFrom } from '../domain/config';
import type { Request, Response } from '../domain/messages';
import type { ConfigState, ProxyEndpoint, SubscriptionSource } from '../domain/types';
import { useI18n } from '../i18n/LocaleProvider';
import type { TranslationKey } from '../i18n/locale';
import { downloadSubscriptionText, SubscriptionDownloadError, type SubscriptionDownloadErrorCode } from '../subscription/download';
import { parseSubscription, parseSubscriptionReport, SubscriptionParseError,
  SUBSCRIPTION_ERROR_CODES, type SubscriptionErrorCode } from '../subscription/parser';
import { ClearableInput } from './ProxyEntry';

type Report = ReturnType<typeof parseSubscription>;
type Node = Report['nodes'][number];
type ReadStatus = 'unread' | 'reading' | 'success' | 'partial' | 'failed';
interface Props {
  source: SubscriptionSource;
  config: ConfigState;
  busy: boolean;
  act: (message: Request) => Promise<Response | null>;
  openLocal: () => void;
  initialUrl?: string;
}
export const SUBSCRIPTION_UI_MAX_BYTES = 1024 * 1024;
export const SUBSCRIPTION_REPORT_SCHEMA = 'ai-proxy-subscription-report-v1';

/** Local input only. Neither raw subscription text nor report details go to storage. */
export function readSubscriptionInput(text: string): Report {
  if (new TextEncoder().encode(text).byteLength > SUBSCRIPTION_UI_MAX_BYTES)
    throw new Error('subscriptionInputTooLarge');
  if (text.trimStart().startsWith('{')) {
    try {
      const report = parseSubscriptionReport(text);
      if (report) return report;
    } catch (error) {
      if (error instanceof SubscriptionParseError && error.code === 'invalid_report')
        throw new Error('subscriptionInvalidReport');
      throw error;
    }
  }
  return parseSubscription(text);
}

const statusKeys: Record<ReadStatus, TranslationKey> = {
  unread: 'subscriptionUnread', reading: 'subscriptionReading', success: 'subscriptionParsed',
  partial: 'subscriptionPartial', failed: 'subscriptionFailed'
};
const compatibilityKeys: Record<Node['compatibility'], TranslationKey> = {
  'chrome-native': 'subscriptionChromeNative', 'local-client': 'subscriptionNeedsLocalClient',
  unsupported: 'subscriptionUnsupported'
};
const reasonKeys: Record<string, TranslationKey> = {
  native_proxy: 'subscriptionNativeReason', authentication_required: 'subscriptionAuthenticationReason',
  custom_transport: 'subscriptionTransportReason', protocol_requires_local_client: 'subscriptionLocalReason',
  non_public_endpoint: 'subscriptionNonPublicReason',
  report_requires_original: 'subscriptionReportDisplayOnly', ipv6_requires_local_client: 'subscriptionIpv6RequiresClient',
  duplicate_configuration: 'subscriptionDuplicateConfigurationReason',
  unsupported_protocol: 'subscriptionUnsupportedReason'
};

/** Fixed, translated diagnostics only. Rejected fields and exceptions are never displayed. */
export const subscriptionErrorKeys: Record<SubscriptionErrorCode, TranslationKey> = {
  depth_limit: 'subscriptionErrorDepth', value_limit: 'subscriptionErrorValues',
  node_limit: 'subscriptionErrorNodes', scalar_limit: 'subscriptionErrorScalar',
  input_limit: 'subscriptionInputTooLarge', empty_subscription: 'subscriptionErrorEmpty',
  invalid_base64: 'subscriptionErrorBase64', invalid_encoding: 'subscriptionErrorEncoding',
  invalid_json: 'subscriptionErrorJson', invalid_yaml: 'subscriptionErrorYaml',
  invalid_key: 'subscriptionErrorKey', duplicate_key: 'subscriptionErrorDuplicateKey',
  forbidden_feature: 'subscriptionErrorForbidden', invalid_fields: 'subscriptionErrorFields',
  unsupported_fields: 'subscriptionErrorUnsupportedFields', invalid_port: 'subscriptionErrorPort',
  invalid_server: 'subscriptionErrorServer', invalid_uri: 'subscriptionErrorUri',
  unsafe_label: 'subscriptionErrorLabel', invalid_subscription: 'subscriptionErrorFormat',
  invalid_report: 'subscriptionInvalidReport'
};
export const subscriptionDownloadErrorKeys: Record<SubscriptionDownloadErrorCode, TranslationKey> = {
  'invalid-url': 'subscriptionDownloadInvalidUrl',
  'origin-mismatch': 'subscriptionDownloadOriginMismatch',
  'fetch-failed': 'subscriptionDownloadFailed',
  timeout: 'subscriptionDownloadTimeout',
  'redirect-refused': 'subscriptionDownloadRedirect',
  'http-error': 'subscriptionDownloadHttp',
  'response-too-large': 'subscriptionInputTooLarge',
  'empty-response': 'subscriptionDownloadEmpty',
  'encoding-invalid': 'subscriptionDownloadEncoding'
};

/** Only explicitly classified, unauthenticated native nodes can cross the config boundary. */
export function subscriptionNativeEndpoint(node: Node, sourceId: string, id: string): ProxyEndpoint {
  if (node.compatibility !== 'chrome-native' || !node.scheme)
    throw new Error('subscriptionNativeUnavailable');
  return endpointFrom({ id, name: node.name, scheme: node.scheme, host: node.server,
    port: node.port, sourceId });
}

export function SubscriptionReader({ source, config, busy, act, openLocal, initialUrl = '' }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [downloadUrl, setDownloadUrl] = useState(initialUrl);
  const lastInitialUrl = useRef(initialUrl);
  const [status, setStatus] = useState<ReadStatus>('unread');
  const [report, setReport] = useState<Report | null>(null);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [errorCode, setErrorCode] = useState<SubscriptionErrorCode | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  // Preserve an endpoint ID after a profile-save failure so retry does not create another endpoint.
  const pendingIds = useRef(new Map<number, string>());
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocus = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const panelId = `subscription-reader-${source.id}`;
  const disabled = busy || status === 'reading' || saving !== null;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; };
  }, []);
  useEffect(() => { if (expanded) input.current?.focus(); }, [expanded]);
  useEffect(() => {
    // Cancelling a file read first enables the trigger in the committed DOM.
    // Wait for that commit (and any parent operation) before restoring focus.
    if (expanded || disabled || !restoreTriggerFocus.current) return;
    restoreTriggerFocus.current = false;
    trigger.current?.focus();
  }, [expanded, disabled]);
  useEffect(() => {
    if (initialUrl === lastInitialUrl.current) return;
    lastInitialUrl.current = initialUrl;
    if (initialUrl) setDownloadUrl(initialUrl);
  }, [initialUrl]);

  function close() {
    // The keyboard and visible Cancel action share the same save boundary.
    if (saving !== null) return;
    getEnvironment().setDraftDirty(false,panelId);
    restoreTriggerFocus.current = true;
    generation.current++;
    setText('');
    if (fileInput.current) fileInput.current.value = '';
    if (status === 'reading') { setStatus('unread'); setReport(null); }
    setExpanded(false);
  }
  function startRead() {
    getEnvironment().setDraftDirty(true,panelId);
    const token = ++generation.current;
    setReport(null); setSaved([]); setPage(0); pendingIds.current.clear();
    setErrorKey(null); setErrorCode(null); setStatus('reading');
    return token;
  }
  function finishRead(raw: string, token: number) {
    if (!mounted.current || token !== generation.current) return;
    try {
      const next = readSubscriptionInput(raw);
      setReport(next);
      if (!next.nodes.length) {
        setStatus('failed'); setErrorKey('subscriptionAllInvalid');
      } else setStatus(next.invalidCount > 0 ? 'partial' : 'success');
    } catch (error) {
      setStatus('failed');
      if (error instanceof SubscriptionParseError) {
        const code = SUBSCRIPTION_ERROR_CODES.find(code => code === error.code) ?? 'invalid_subscription';
        setErrorCode(code);
      }
      // Never surface parser messages or raw file names: they can contain credentials.
      setErrorKey(error instanceof Error && error.message === 'subscriptionInputTooLarge'
        ? 'subscriptionInputTooLarge'
        : error instanceof SubscriptionParseError && error.code !== 'invalid_report'
          ? 'subscriptionParseFailed' : 'subscriptionInvalidReport');
    }
  }
  function changeTextDraft(value: string) {
    setText(value);
    // An earlier parse is not evidence about the new input. Prevent stale
    // results from offering SAVE_ENDPOINT for a different pasted subscription.
    if (status !== 'unread' || report || errorKey || errorCode) {
      generation.current++;
      setStatus('unread');
      setReport(null);
      setErrorKey(null);
      setErrorCode(null);
      setSaved([]);
      setPage(0);
      pendingIds.current.clear();
    }
  }
  function readText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = text;
    setText('');
    finishRead(raw, startRead());
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    setText('');
    if (!file) return;
    const token = startRead();
    if (file.size > SUBSCRIPTION_UI_MAX_BYTES) {
      setStatus('failed'); setErrorKey('subscriptionInputTooLarge'); return;
    }
    try { finishRead(await file.text(), token); }
    catch {
      if (mounted.current && token === generation.current) {
        setStatus('failed'); setErrorKey('subscriptionFileFailed');
      }
    }
  }
  async function readDownload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setText('');
    if (fileInput.current) fileInput.current.value = '';
    const token = startRead();
    try {
      const raw = await getEnvironment().download(downloadUrl, source.originHost);
      finishRead(raw, token);
    } catch (error) {
      if (!mounted.current || token !== generation.current) return;
      setStatus('failed');
      setErrorCode(null);
      const key = error instanceof SubscriptionDownloadError
        ? subscriptionDownloadErrorKeys[error.code] : 'subscriptionDownloadFailed';
      setErrorKey(key);
    }
  }
  async function saveNative(node: Node, index: number) {
    const manual = config.sources.find(item => item.kind === 'manual');
    if (!manual) { setErrorKey('subscriptionManualSourceMissing'); return; }
    setSaving(index); setErrorKey(null);
    try {
      const id = pendingIds.current.get(index) ?? crypto.randomUUID();
      pendingIds.current.set(index, id);
      const endpoint = subscriptionNativeEndpoint(node, manual.id, id);
      const endpointResult = await act({ type: 'SAVE_ENDPOINT', endpoint });
      if (!endpointResult?.ok) { setErrorKey('subscriptionSaveFailed'); return; }
      const profileResult = await act({ type: 'SAVE_PROFILE', profile: {
        id: 'profile-' + id, name: endpoint.name, kind: 'endpoint', endpointId: id, sourceId: manual.id
      } });
      if (!profileResult?.ok) { setErrorKey('subscriptionProfileSaveFailed'); return; }
      if (mounted.current) setSaved(current => [...current, index]);
    } catch { if (mounted.current) setErrorKey('subscriptionSaveFailed'); }
    finally { if (mounted.current) setSaving(null); }
  }
  return <div data-draft-scope={panelId} className="subscriptionReader" data-read-status={status}>
    <div className="subscriptionReaderToolbar">
      <span className="subscriptionReadStatus" role="status" aria-live="polite">{t(statusKeys[status])}</span>
      {!report && <span>{t('compatibilityUnknown')}</span>}
      <Button ref={trigger} disabled={disabled} aria-expanded={expanded} aria-controls={panelId}
        aria-label={t('subscriptionReadNamed', { name: source.displayName })}
        onClick={() => expanded ? close() : setExpanded(true)}>{t('subscriptionRead')}</Button>
    </div>
    {expanded && <section id={panelId} className="subscriptionReaderPanel"
      aria-label={t('subscriptionReaderNamed', { name: source.displayName })}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
      <div className="sourceEditorHead"><h3>{t('subscriptionReadLocalTitle')}</h3>
        <Button type="button" disabled={saving !== null} onClick={close}>{t('cancel')}</Button></div>
      <p className="sourceFieldNote">{t('subscriptionMemoryNotice')}</p>
      <form onSubmit={readText}>
        <div className="field"><label htmlFor={panelId + '-text'}>{t('subscriptionTextLabel')}</label>
          <textarea ref={input} id={panelId + '-text'} rows={5} value={text} disabled={disabled}
            autoComplete="off" spellCheck={false} onChange={event => changeTextDraft(event.target.value)} /></div>
        <div className="actions"><Button type="submit" variant="primary" className="primary" disabled={disabled || !text.trim()}>
          {t('subscriptionParseText')}</Button></div>
      </form>
      <div className="field"><label htmlFor={panelId + '-file'}>{t('subscriptionFileLabel')}</label>
        <input ref={fileInput} id={panelId + '-file'} type="file" disabled={disabled}
          accept=".txt,.yaml,.yml,.json,.conf,text/plain,application/json" onChange={event => void readFile(event)} /></div>
      <form onSubmit={event => void readDownload(event)}>
        <div className="field"><label htmlFor={panelId + '-url'}>{t('subscriptionDownloadUrlLabel')}</label>
          <ClearableInput id={panelId + '-url'} type="url" value={downloadUrl} disabled={disabled}
            fieldLabel={t('subscriptionDownloadUrlLabel')}
            autoComplete="off" spellCheck={false} placeholder={'https://' + source.originHost + '/…'}
            onValueChange={setDownloadUrl} /></div>
        <p className="sourceFieldNote">{t('subscriptionDownloadNotice', { host: source.originHost })}</p>
        <div className="actions"><Button type="submit" variant="primary" className="primary" disabled={disabled || !downloadUrl.trim()}>
          {t(report ? 'subscriptionDownloadUpdate' : 'subscriptionDownloadRead')}</Button></div>
      </form>
      {errorKey && <p role="alert">{t(errorKey)}</p>}
      {errorCode && <p className="subscriptionFailureCode">{errorCode} · {t(subscriptionErrorKeys[errorCode])}</p>}
      {report && <div className="subscriptionReadResult">
        <p>{t('subscriptionSummary', { format: report.format, count: report.nodes.length,
          invalid: report.invalidCount, duplicates: report.duplicateCount })}</p>
        {report.invalidCount > 0 && <section className="subscriptionDiagnostics"
          aria-label={t('subscriptionDiagnosticsTitle')}>
          <h4>{t('subscriptionDiagnosticsTitle')}</h4>
          {report.invalidReasons ? <ul>{Object.entries(report.invalidReasons).map(([code, count]) =>
            <li key={code}>{code} · {t(subscriptionErrorKeys[code as SubscriptionErrorCode])} · {count}</li>)}</ul>
            : <p>{t('subscriptionDiagnosticsUnavailable')}</p>}
          <p className="sourceFieldNote">{t('subscriptionDiagnosticsNotice')}</p>
        </section>}
        <p>{t('subscriptionProtocols', { protocols: Object.entries(report.protocols)
          .map(([protocol, count]) => `${protocol}: ${count}`).join(', ') || t('subscriptionNoProtocols') })}</p>
        <div className="rowBadges">{(['chrome-native', 'local-client', 'unsupported'] as const).map(kind =>
          <span key={kind}>{t(compatibilityKeys[kind])}: {report.nodes.filter(node => node.compatibility === kind).length}</span>)}</div>
        <p className="sourceFieldNote">{t('subscriptionNotConnectivity')}</p>
        <p className="sourceFieldNote">{t('subscriptionSaveNotice')}</p>
        <ul className="subscriptionNodes">{report.nodes.slice(page * 50, (page + 1) * 50).map((node, offset) => {
          const index = page * 50 + offset;
          return <li key={index} className="subscriptionNode">
          <strong>{node.name}</strong><small>{node.protocol} · {t(compatibilityKeys[node.compatibility])}</small>
          <p>{t(reasonKeys[node.reason] ?? 'subscriptionUnsupportedReason')}</p>
          {node.compatibility === 'chrome-native' && <Button disabled={disabled || saved.includes(index)}
            aria-label={t('subscriptionSaveNamed', { name: node.name })}
            onClick={() => void saveNative(node, index)}>{t(saved.includes(index) ? 'subscriptionSaved'
              : saving === index ? 'subscriptionSaving' : 'subscriptionSaveNative')}</Button>}
          {node.compatibility === 'local-client' && <Button disabled={disabled} onClick={() => {
            setText(''); openLocal();
          }}>{t('subscriptionConfigureLocal')}</Button>}
        </li>; })}</ul>
        {report.nodes.length > 50 && <nav className="subscriptionPagination" aria-label={t('subscriptionPagination')}>
          <p>{t('subscriptionPageRange', { start: page * 50 + 1,
            end: Math.min((page + 1) * 50, report.nodes.length), total: report.nodes.length })}</p>
          <Button disabled={disabled || page === 0} onClick={() => setPage(current => current - 1)}>{t('subscriptionPrevious')}</Button>
          <Button disabled={disabled || (page + 1) * 50 >= report.nodes.length}
            onClick={() => setPage(current => current + 1)}>{t('subscriptionNext')}</Button>
        </nav>}
      </div>}
    </section>}
  </div>;
}
