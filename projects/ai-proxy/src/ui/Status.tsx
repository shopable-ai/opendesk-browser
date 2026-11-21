import * as React from 'react';
import { localizedBackendError } from '../i18n/errors';
import { useI18n } from '../i18n/LocaleProvider';
import type { TranslationKey } from '../i18n/locale';
import type { Profile, RouteSelection, RuntimeStatus, RouteMode } from '../domain/types';

export function needsProxyRelease(status: RuntimeStatus): boolean {
  return status.browserMode === 'system' && status.control === 'controllable_by_this_extension' &&
    status.permission === true && status.canStop === true && status.outcomeUnknown === true &&
    !status.statusErrorCode;
}

const modeLabel = {
  profile: 'popupModeProfile', rules: 'sideModeRules', direct: 'sideModeDirect', system: 'popupModeSystem'
} as const satisfies Record<RouteMode, TranslationKey>;

export const connectionActionLabel = {
  enable: 'connectionEnable', pause: 'connectionPause', apply: 'connectionApplyChanges', stop: 'stopManagingProxy', release: 'apReleasePreviousRoute',
  endDirect: 'connectionEndDirect', finalize: 'apFinishStop', refresh: 'refreshStatus', choose: 'sideProxyChooseAction'
} as const;

export function hasProxyConflict(status: RuntimeStatus & { state?: string }) {
  return status.state === 'conflict' || status.control === 'controlled_by_other_extensions' ||
    status.control === 'not_controllable';
}

function followsSystem(status: RuntimeStatus) {
  return !status.managedIntent && status.desired.mode === 'system' &&
    status.browserMode === 'system' && status.control === 'controllable_by_this_extension' &&
    status.canStop === false && !status.pendingChanges && !status.proxyError && !status.statusErrorCode &&
    !status.outcomeUnknown && status.permission !== false;
}

export function confirmedRouteMode(status: RuntimeStatus): RouteMode | undefined {
  if (status.applied) return status.activeSelection?.mode;
  if (!status.managedIntent && status.browserMode === 'system' &&
      status.control === 'controllable_by_this_extension' && status.canStop === false &&
      status.permission !== false && !status.outcomeUnknown && !status.statusErrorCode) return 'system';
}

export function routeSwitchBlocked(status: RuntimeStatus & {state?: string}) {
  return hasProxyConflict(status) || status.permission === false || Boolean(status.statusErrorCode ||
    status.outcomeUnknown || status.stopFinalizationPending) || status.control === 'unknown' ||
    status.state === 'unavailable' || (!status.managedIntent && status.control === 'controlled_by_this_extension');
}

export function activeStopLabel(status: RuntimeStatus) {
  if (status.canStop && status.applied)
    return status.activeSelection?.mode === 'direct' ? 'connectionEndDirect'
      : status.activeSelection?.mode === 'profile' ? 'connectionPause' : 'stopManagingProxy';
}

export function connectionAction(status: RuntimeStatus, hasProfile: boolean): keyof typeof connectionActionLabel | undefined {
  if (needsProxyRelease(status)) return 'release';
  if (status.stopFinalizationPending) return 'finalize';
  if (hasProxyConflict(status) || status.permission === false) return 'refresh';
  if (status.canStop && (status.outcomeUnknown ||
      (!status.managedIntent && status.control === 'controlled_by_this_extension'))) return 'stop';
  if (status.statusErrorCode || status.outcomeUnknown || status.control === 'unknown') return 'refresh';
  if (followsSystem(status)) return;
  if (status.applied && !status.pendingChanges && status.canStop)
    return status.activeSelection?.mode === 'direct' ? 'endDirect'
      : status.activeSelection?.mode === 'profile' ? 'pause' : 'stop';
  if (status.desired.mode === 'profile' && !hasProfile) return 'choose';
  if (status.managedIntent && status.pendingChanges) return 'apply';
  if (!status.managedIntent && !routeSwitchBlocked(status) && status.pendingChanges) return 'enable';
}

/** Only confirmed Chrome application gets green. A failed operation is red even if
 * Chrome still has an earlier verified route; pending and paused remain distinct. */
export function statusTone(status: RuntimeStatus): 'danger' | 'ok' | 'pending' | 'muted' {
  if ((!status.managedIntent && status.control === 'controlled_by_this_extension') ||
      hasProxyConflict(status) ||
      Boolean(status.proxyError)) return 'danger';
  if (status.managedIntent && status.pendingChanges) return 'pending';
  if (status.applied) return 'ok';
  return status.managedIntent ? 'pending' : 'muted';
}

export function statusLabelKey(status: RuntimeStatus): TranslationKey {
  if (status.statusErrorCode) return 'apProxyStatusUnavailable';
  if (!status.managedIntent && status.control === 'controlled_by_this_extension')
    return 'proxyControlStillHeld';
  if (hasProxyConflict(status)) return 'proxyControlConflict';
  if (needsProxyRelease(status)) return 'apRouteRecoveryNeeded';
  if (status.outcomeUnknown || status.control === 'unknown') return 'apProxyStatusUnavailable';
  if (status.proxyError) return 'proxyOperationFailedShort';
  if (status.managedIntent && status.pendingChanges) return 'proxyPendingShort';
  if (!status.managedIntent && status.desired.mode === 'system' && status.browserMode === 'system' &&
      status.control === 'controllable_by_this_extension' && !status.outcomeUnknown) return 'apFollowingSystem';
  if (status.applied) return 'appliedToChrome';
  return status.managedIntent ? 'proxyPendingShort' : 'browserProxyNotManaged';
}

export function Status({ status, compact = false, quiet = false, labelOverride, profiles, operationErrorShown = false }: {
  status: RuntimeStatus; compact?: boolean; quiet?: boolean; labelOverride?: TranslationKey;
  profiles?: Profile[]; operationErrorShown?: boolean;
}) {
  const { t, locale } = useI18n();
  const needsRelease = needsProxyRelease(status);
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
    !status.outcomeUnknown && !status.statusErrorCode && status.permission !== false &&
    status.control === 'controllable_by_this_extension';
  const tone = statusTone(status);
  const labelKey = quiet && status.applied && tone==='ok' && !status.outcomeUnknown && !status.statusErrorCode
    ? 'connectionApplied' : idle && labelOverride ? labelOverride
    : quiet && profiles && followsSystem(status) && !status.proxyError ? 'apFollowingSystem'
    : statusLabelKey(status);
  function routeName(route: RouteSelection) {
    return route.mode === 'profile'
      ? profiles?.find(profile => profile.id === route.profileId)?.name ?? t(modeLabel.profile)
      : t(modeLabel[route.mode]);
  }
  const selection = status.desired;
  const hasSelectedRoute = selection.mode !== 'profile' || profiles?.some(profile => profile.id === selection.profileId);
  const observedMode = status.browserMode;
  const observedRoute = observedMode && (Object.hasOwn(modeLabel, observedMode)
    ? t(modeLabel[observedMode as RouteMode])
    : observedMode === 'fixed_servers' ? t('specificProxy')
      : observedMode === 'pac_script' ? t('sideRoutePac')
        : observedMode === 'auto_detect' ? t('sideRouteAutoDetect') : undefined);
  const conflict = hasProxyConflict(status);
  const unverified = status.outcomeUnknown || status.statusErrorCode || status.control === 'unknown';
  const currentRoute = !unverified && status.permission !== false && !conflict &&
    (status.applied && status.activeSelection ? routeName(status.activeSelection) : observedRoute);
  const pendingRoute = profiles && status.managedIntent && status.pendingChanges && hasSelectedRoute
    ? t('connectionPendingRoute',{route:routeName(selection)})
    : profiles && idle && status.pendingChanges && hasSelectedRoute
      ? t('sideSelectedInactive',{route:routeName(selection)}) : undefined;
  const pendingHeading = labelKey === 'proxyPendingShort' && pendingRoute;
  const needsDetails = stranded || pending || tone==='danger' || status.outcomeUnknown ||
    status.statusErrorCode || status.control==='unknown' || status.permission===false || status.credentialRequired;
  return <section className={'status ' + (compact ? 'statusCompact' : '')} aria-live="polite">
    <div className="statusTop"><span className={'statusDot ' + tone}></span>
      <strong className={pendingHeading ? 'quickSelection' : undefined}>{pendingHeading || t(labelKey)}</strong>
    </div>
    {profiles && labelKey !== 'apFollowingSystem' && <div className="connectionRoutes">
      {currentRoute && <p className="quickActual">{t('sideCurrentRoute')}<strong data-testid="side-current-route">{currentRoute}</strong></p>}
      {unverified && status.activeSelection &&
        <p>{t('connectionLastRoute',{route:routeName(status.activeSelection)})}</p>}
      {pendingRoute && !pendingHeading && <p className="quickSelection">{pendingRoute}</p>}
    </div>}
    {quiet && profiles ? <>
      {conflict && <p className="notice error">{status.control === 'not_controllable' ||
        status.control === 'controlled_by_other_extensions' ? controlName[status.control] : t('apProxyControlHeld')}</p>}
      {status.permission === false && <p className="notice error">{t('apProxyPermissionDenied')}</p>}
    </> : quiet ? needsDetails && <details className="r86StatusDetails">
      <summary>{t('r86Tech')}</summary>
      <small title={status.control}>{t('controlOwner',{owner:controlName[status.control]})}{t('chromeModeLabel2',{mode:status.browserMode || t('unknown')})}</small>
      {technical}
      {pending && !needsRelease && <p className="notice">{t('selectedModeLabel',{mode:modeName[status.desired.mode]})}
        {status.activeSelection ? t('chromeStillUsingLastConfirmedMode',{mode:modeName[status.activeSelection.mode]})
          : t('chromeSettingsAreUnverifiedTheActualWebsiteRouteCannot')}
        {t('pendingRoutingAdvice')}
      </p>}
    </details> : <>
      <small title={status.control}>{t('controlOwner',{owner:controlName[status.control]})}{t('chromeModeLabel2',{mode:status.browserMode || t('unknown')})}</small>
      {technical}
      {pending && !needsRelease && <p className="notice">{t('selectedModeLabel',{mode:modeName[status.desired.mode]})}
        {status.activeSelection ? t('chromeStillUsingLastConfirmedMode',{mode:modeName[status.activeSelection.mode]})
          : t('chromeSettingsAreUnverifiedTheActualWebsiteRouteCannot')}
        {t('pendingRoutingAdvice')}
      </p>}
    </>}
    {stranded && <p className="notice error">{t('proxyControlStillHeldHelp')}</p>}
    {status.credentialRequired && <p className="notice">{t('sessionCredentialsForThisProxyAreMissingOrExpired')}</p>}
    {needsRelease && <p className="notice">{t('apRouteRecoveryHelp')}</p>}
    {!needsRelease && status.proxyError && !operationErrorShown && !(profiles && (conflict || status.permission === false)) &&
      <p className="notice error">{status.statusErrorCode==='E_TOOL' && status.control==='unknown'
      ?t('apStatusReadFailedHelp'):localizedBackendError(locale, status.proxyError,status.statusErrorCode)}</p>}
    {status.probe && <p className="notice">{(status.probe.messageCode === 'probeSuccess' || (!status.probe.messageCode && status.probe.ok)) ? t('probeSuccess',{ip:status.probe.exitIp ?? t('unknownExitIp')}) : t('probeFailure')}</p>}
    {!compact && <p className="hint">{t('appliedSettingsDoNotProveConnectivityOrADevice')}</p>}
  </section>;
}
