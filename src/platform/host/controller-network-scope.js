import {normalizeSdkTargetScope} from '../../framework/sdk/target-origins.js';
import {httpUrl} from '../target/index.js';
import {invariant} from '../protocol.js';

// Controller grants are pinned at trusted admission to one durable run and
// never inherited from MAIN SDK's document grant or Chrome <all_urls>.
export function normalizeControllerNetworkOrigins(sourceOrigin, requested = [], {installedTask = false} = {}) {
  const origins = normalizeSdkTargetScope(sourceOrigin, requested).targetOrigins;
  invariant(!installedTask || !origins.length, 'E_PERMISSION',
    '安装任务不能继承草稿的跨站授权，请审核任务清单中的网络能力');
  return origins;
}
export function assertControllerNetworkTarget({url,sourceOrigin,additionalOrigins = [],
  serviceCall = false,method = '',capability} = {}) {
  const origin=httpUrl(url).origin;
  invariant(origin===sourceOrigin || (
    serviceCall && capability==='network' && /^AXIOS_(GET|POST|PUT|DELETE)$/.test(method) &&
    additionalOrigins.includes(origin)), 'E_PERMISSION',
    'Cross-origin controller operation denied: '+origin+
    '；请在 Sidebar「开发」填写精确 Origin 再主动运行；网页 SDK 权限不适用于 Controller');
  return origin;
}
