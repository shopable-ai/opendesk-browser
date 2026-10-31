import type { ErrorCode } from '../domain/error-codes';
import { errorCodeOf } from '../domain/error-codes';
import { translate, type SupportedLocale, type TranslationKey } from './locale';

const sdkErrorKeys: Record<string, TranslationKey> = {
  E_PREVIEW_READONLY:'apProxyDebugUnavailable', E_PREVIEW_CAPABILITY:'apProxyDebugUnavailable',
  E_PREVIEW_GRANT:'apSourceChanged', E_TOOL_CHANGED:'apSourceChanged', E_REVOKED:'apSourceChanged',
  E_PERMISSION_DENIED:'apProxyPermissionDenied', E_CAPABILITY_DENIED:'apProxyPermissionDenied',
  E_NOT_CONNECTED:'apProxyNotConnected', E_UNAVAILABLE:'apProxyNotConnected',
  E_UNSUPPORTED:'apProxyUnsupported', E_PROXY_PROFILE_NOT_APPROVED:'apProxyPermissionDenied',
  E_CONFLICT:'apConfigConflict', E_QUOTA:'apConfigQuota', E_OUTCOME_UNKNOWN:'apOutcomeUnknown',
  E_CONTROL_HELD:'apProxyControlHeld'
};

/** Never show raw internal error details or sensitive URL fragments in the UI. */
export function localizedBackendError(locale: SupportedLocale, legacyMessage: string, code?: ErrorCode | string): string {
  const sdkKey=code ? sdkErrorKeys[code] : undefined;
  return translate(locale, sdkKey ?? (code?.startsWith('err') ? code as TranslationKey : errorCodeOf(legacyMessage)));
}
