import {normalizeSdkTargetScope} from '../../framework/sdk/target-origins.js';
import {httpUrl} from '../target/index.js';
import {invariant} from '../protocol.js';

// Controller grants are pinned at trusted admission to one durable run and
// never inherited from MAIN SDK's document grant or Chrome <all_urls>.
export function normalizeControllerNetworkOrigins(sourceOrigin, requested = [], {installedTask = false} = {}) {
  const origins = normalizeSdkTargetScope(sourceOrigin, requested).targetOrigins;
  invariant(!installedTask || !origins.length, 'E_PERMISSION',
    '安装任务必须单独授权跨站网络');
  return origins;
}
export function assertControllerNetworkTarget({url,sourceOrigin,additionalOrigins = [],
  serviceCall = false,method = '',capability} = {}) {
  const origin=httpUrl(url).origin;
  invariant(origin===sourceOrigin || (
    serviceCall && capability==='network' && /^AXIOS_(GET|POST|PUT|DELETE)$/.test(method) &&
    additionalOrigins.includes(origin)), 'E_PERMISSION',
    'Cross-origin controller operation denied: '+origin+
    '；请在「开发」授权精确 Origin，网页 SDK 授权不通用');
  return origin;
}
