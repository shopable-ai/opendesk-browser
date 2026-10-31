import {getEnvironment} from '../environment';
import {Button} from '@opendesk/ui';
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { useI18n } from '../i18n/LocaleProvider';
import type { ProxyScheme } from '../domain/types';
import { LOCAL_CLIENT_PRESETS, portPresetsForScheme } from '../domain/proxy-entry';

type ClearableProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  fieldLabel: string;
  revealPassword?: boolean;
};

/** Clear affects only the controlled draft; it never saves or applies a proxy. */
export function ClearableInput({ value, onValueChange, fieldLabel, revealPassword = false, className, ...props }: ClearableProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { if (!value || props.disabled) setRevealed(false); }, [value, props.disabled]);
  const canReveal = revealPassword && props.type === 'password' && !props.disabled && value !== '';
  const revealLabel = revealed ? t('hidePassword') : t('showPassword');
  return <span className={'fieldWithClear' + (className ? ' ' + className : '')}>
    <input {...props} ref={ref} type={canReveal && revealed ? 'text' : props.type}
      style={canReveal ? {...props.style, paddingRight:66} : props.style}
      value={value} onChange={event => onValueChange(event.target.value)} />
    {canReveal && <Button type="button" className="fieldReveal"
      style={{right:35}} aria-label={revealLabel} title={revealLabel}
      onMouseDown={event=>event.preventDefault()} onClick={()=>{setRevealed(previous=>!previous);ref.current?.focus();}}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/>
        <circle cx="12" cy="12" r="2.7"/>
        {revealed && <path d="M3 21 21 3"/>}
      </svg>
    </Button>}
    {value !== '' && !props.disabled && <Button type="button" className="fieldClear"
      aria-label={t('clearField', { field: fieldLabel })} title={t('clearField', { field: fieldLabel })}
      onMouseDown={event => event.preventDefault()}
      onClick={() => { getEnvironment().markDraftFrom(ref.current);setRevealed(false); onValueChange(''); ref.current?.focus(); }}>×</Button>}
  </span>;
}

export function HostQuickPick({ value, onChoose }: { value: string; onChoose: (host: string) => void }) {
  const { t } = useI18n();
  async function choose(host: '127.0.0.1' | 'localhost', target: EventTarget & HTMLElement) {
    if (value === host) return;
    const environment = getEnvironment();
    const scope = target.closest('[data-draft-scope]')?.getAttribute('data-draft-scope');
    const revision = scope ? environment.getDraftRevision(scope) : 0;
    const dialog = target.closest('dialog');
    const previous = value.trim().toLowerCase();
    // Presets may fill an empty/loopback host immediately, but must never
    // silently replace an existing custom remote hostname.
    if (previous && previous !== '127.0.0.1' && previous !== 'localhost' &&
        !await environment.confirm(t('quickHostReplaceConfirm', { host }))) return;
    if (getEnvironment() !== environment || target.isConnected === false || (dialog && !dialog.open) ||
      (scope && environment.getDraftRevision(scope) !== revision)) return;
    environment.markDraftFrom(target);
    onChoose(host);
  }
  return <div className="proxyQuickPicks" role="group" aria-label={t('quickHostAddresses')}>
    {(['127.0.0.1', 'localhost'] as const).map(host =>
      <Button type="button" key={host} aria-pressed={value === host}
        className={value === host ? 'isActive' : ''} onClick={event => choose(host,event.currentTarget)}>{host}</Button>)}
  </div>;
}

export function PortQuickPick({ scheme, value, onChoose }: {
  scheme: ProxyScheme;
  value: string;
  onChoose: (port: string) => void;
}) {
  const { t } = useI18n();
  return <div className="proxyQuickPicks" role="group" aria-label={t('commonProxyPorts')}>
    {portPresetsForScheme(scheme).map(port =>
      <Button type="button" key={port} aria-pressed={value === port}
        className={value === port ? 'isActive' : ''} onClick={event => {if(value!==port)getEnvironment().markDraftFrom(event.currentTarget);onChoose(port);}}>{port}</Button>)}
  </div>;
}

/** One deliberate choice changes BOTH protocol and port in the unsaved local draft. */
export function LocalClientQuickPreset({ scheme, value, onChoose }: {
  scheme: ProxyScheme;
  value: string;
  onChoose: (scheme: 'http' | 'socks5', port: string) => void;
}) {
  const { t } = useI18n();
  return <div className="proxyQuickPicks localClientQuickPresets" role="group"
    aria-label={t('localClientPresetLabel')}>
    {LOCAL_CLIENT_PRESETS.map(preset =>
      <Button type="button" key={preset.scheme+':'+preset.port}
        aria-pressed={scheme === preset.scheme && value === preset.port}
        className={scheme === preset.scheme && value === preset.port ? 'isActive' : ''}
        onClick={event=>{if(scheme!==preset.scheme||value!==preset.port)getEnvironment().markDraftFrom(event.currentTarget);onChoose(preset.scheme,preset.port);}}>{preset.label}</Button>)}
  </div>;
}
