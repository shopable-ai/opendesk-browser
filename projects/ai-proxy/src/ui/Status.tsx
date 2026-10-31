import { localizedBackendError } from '../i18n/errors';
import { useI18n } from '../i18n/LocaleProvider';
import type { TranslationKey } from '../i18n/locale';
import type { RuntimeStatus, RouteMode } from '../domain/types';


/** Only confirmed Chrome application gets green. A failed operation is red even if
 * Chrome still has an earlier verified route; pending and paused remain distinct. */
export function statusTone(status: RuntimeStatus): 'danger' | 'ok' | 'pending' | 'muted' {
  if ((!status.managedIntent && status.control === 'controlled_by_this_extension') ||
      status.control === 'controlled_by_other_extensions' || status.control === 'not_controllable' ||
      Boolean(status.proxyError)) return 'danger';
  if (status.managedIntent && status.pendingChanges) return 'pending';
  if (status.applied) return 'ok';
  return status.managedIntent ? 'pending' : 'muted';
}

export function statusLabelKey(status: RuntimeStatus): TranslationKey {
  if (status.statusErrorCode) return 'apProxyStatusUnavailable';
  if (!status.managedIntent && status.control === 'controlled_by_this_extension')
    return 'stopIncompleteProxyControlStillHeld';
  if (status.control === 'controlled_by_other_extensions' || status.control === 'not_controllable')
    return 'proxyControlConflict';
  if (status.proxyError) return 'proxyOperationFailedShort';
  if (status.managedIntent && status.pendingChanges) return 'proxyPendingShort';
  if (status.applied) return 'appliedToChrome';
  return status.managedIntent ? 'proxyPendingShort' : 'browserProxyNotManaged';
}

export function Status({ status, compact = false, quiet = false, labelOverride }: {
  status: RuntimeStatus; compact?: boolean; quiet?: boolean; labelOverride?: TranslationKey;
}) {
  const { t, locale } = useI18n();
const modeName: Record<RouteMode, string> = {
  system: t('useSystemSettings'), direct: t('directConnection'), profile: t('useAProfile'), rules: t('websiteRules2')
};
const controlName: Record<RuntimeStatus['control'], string> = {
  not_controllable: t('browserPolicyPreventsChanges'),
  controlled_by_other_extensions: t('controlledByAnotherExtension'),
  controllable_by_this_extension: t('notManagingYet'),
  controlled_by_this_extension: t('controlledByAiProxy'),
  unknown: t('unableToVerify')
};
  const technical = <small>{t('apProxyPermissionLabel',{value:t(status.permission===true?'apGranted':status.permission===false?'apNotGranted':'apUnconfirmed')})}
    {status.statusErrorCode && /^E_[A-Z0-9_]{1,60}$/.test(status.statusErrorCode) ? ` · ${status.statusErrorCode}` : ''}</small>;

  const stranded = !status.managedIntent && status.control === 'controlled_by_this_extension';
  const pending = status.managedIntent && (!status.applied || status.pendingChanges);
  // Onboarding labels never hide verified control conflicts, errors or active routes.
  const idle = !status.managedIntent && !status.applied && !status.proxyError &&
    status.control !== 'controlled_by_this_extension' &&
    status.control !== 'controlled_by_other_extensions' &&
    status.control !== 'not_controllable';
  const label = t(idle && labelOverride ? labelOverride : statusLabelKey(status));
  const tone = statusTone(status);
  return <section className={'status ' + (compact ? 'statusCompact' : '')} aria-live="polite">
    <div className="statusTop"><span className={'statusDot ' + tone}></span><strong>{label}</strong></div>
    {quiet ? <details className="r86StatusDetails">
      <summary>{t('r86Tech')}</summary>
      <small title={status.control}>{t('controlOwner',{owner:controlName[status.control]})}{t('chromeModeLabel2',{mode:status.browserMode || t('unknown')})}</small>
      {technical}
      {pending && <p className="notice">{t('selectedModeLabel',{mode:modeName[status.desired.mode]})}
        {status.activeSelection ? t('chromeStillUsingLastConfirmedMode',{mode:modeName[status.activeSelection.mode]})
          : t('chromeSettingsAreUnverifiedTheActualWebsiteRouteCannot')}
        {t('pendingRoutingAdvice')}
      </p>}
    </details> : <>
      <small title={status.control}>{t('controlOwner',{owner:controlName[status.control]})}{t('chromeModeLabel2',{mode:status.browserMode || t('unknown')})}</small>
      {technical}
      {pending && <p className="notice">{t('selectedModeLabel',{mode:modeName[status.desired.mode]})}
        {status.activeSelection ? t('chromeStillUsingLastConfirmedMode',{mode:modeName[status.activeSelection.mode]})
          : t('chromeSettingsAreUnverifiedTheActualWebsiteRouteCannot')}
        {t('pendingRoutingAdvice')}
      </p>}
    </>}
    {stranded && <p className="notice error">{t('theStopRequestWasSavedButChromeStillReports')}</p>}
    {status.credentialRequired && <p className="notice">{t('sessionCredentialsForThisProxyAreMissingOrExpired')}</p>}
    {status.proxyError && <p className="notice error">{status.statusErrorCode==='E_TOOL' && status.control==='unknown'
      ?t('apStatusReadFailedHelp'):localizedBackendError(locale, status.proxyError,status.statusErrorCode)}</p>}
    {status.probe && <p className="notice">{(status.probe.messageCode === 'probeSuccess' || (!status.probe.messageCode && status.probe.ok)) ? t('probeSuccess',{ip:status.probe.exitIp ?? t('unknownExitIp')}) : t('probeFailure')}</p>}
    {!compact && <p className="hint">{t('appliedSettingsDoNotProveConnectivityOrADevice')}</p>}
  </section>;
}
