export const STATUS = Object.freeze({
  OPENING: 'OPENING',
  OFFICIAL_PAGE_OPENED_UNVERIFIED: 'OFFICIAL_PAGE_OPENED_UNVERIFIED',
  HANDOFF_UNKNOWN: 'HANDOFF_UNKNOWN',
  USER_REPORTED_CANCELLED_UNVERIFIED: 'USER_REPORTED_CANCELLED_UNVERIFIED',
  USER_REPORTED_COMPLETION_UNVERIFIED: 'USER_REPORTED_COMPLETION_UNVERIFIED',
  USER_REVIEWED_UNVERIFIED: 'USER_REVIEWED_UNVERIFIED'
});

const BLOCKING = new Set([
  STATUS.OPENING,
  STATUS.OFFICIAL_PAGE_OPENED_UNVERIFIED,
  STATUS.HANDOFF_UNKNOWN,
  STATUS.USER_REPORTED_CANCELLED_UNVERIFIED,
  STATUS.USER_REPORTED_COMPLETION_UNVERIFIED
]);

export function canStartHandoff(current) {
  return !current || !BLOCKING.has(current.status) || current.status === STATUS.USER_REVIEWED_UNVERIFIED;
}

export function createHandoffRecord({ id, channelId, actionId, accountLabel, url, now = new Date().toISOString() }) {
  return {
    id,
    channelId,
    actionId,
    accountLabel,
    url,
    createdAt: now,
    updatedAt: now,
    status: STATUS.OPENING,
    evidence: 'extension-created-handoff-only'
  };
}

export function transitionHandoff(current, status, now = new Date().toISOString()) {
  if (!current) throw new TypeError('No handoff to transition');
  const allowed = {
    [STATUS.OPENING]: [STATUS.OFFICIAL_PAGE_OPENED_UNVERIFIED, STATUS.HANDOFF_UNKNOWN],
    [STATUS.OFFICIAL_PAGE_OPENED_UNVERIFIED]: [STATUS.USER_REPORTED_CANCELLED_UNVERIFIED, STATUS.USER_REPORTED_COMPLETION_UNVERIFIED, STATUS.USER_REVIEWED_UNVERIFIED],
    [STATUS.HANDOFF_UNKNOWN]: [STATUS.USER_REVIEWED_UNVERIFIED, STATUS.USER_REPORTED_CANCELLED_UNVERIFIED, STATUS.USER_REPORTED_COMPLETION_UNVERIFIED],
    [STATUS.USER_REPORTED_CANCELLED_UNVERIFIED]: [STATUS.USER_REVIEWED_UNVERIFIED],
    [STATUS.USER_REPORTED_COMPLETION_UNVERIFIED]: [STATUS.USER_REVIEWED_UNVERIFIED],
    [STATUS.USER_REVIEWED_UNVERIFIED]: [STATUS.OPENING]
  };
  if (!allowed[current.status]?.includes(status)) {
    throw new TypeError(`Invalid handoff transition: ${current.status} -> ${status}`);
  }
  return { ...current, status, updatedAt: now };
}

export function recoverHandoff(current, now = new Date().toISOString()) {
  if (!current) return null;
  if (current.status === STATUS.OPENING) {
    return { ...current, status: STATUS.HANDOFF_UNKNOWN, updatedAt: now };
  }
  return current;
}

export function statusLabel(status) {
  const labels = {
    [STATUS.OPENING]: '正在打开官方页面（结果未知）',
    [STATUS.OFFICIAL_PAGE_OPENED_UNVERIFIED]: '官方页面已打开 · 交易未验证',
    [STATUS.HANDOFF_UNKNOWN]: '打开结果未知 · 禁止自动重试',
    [STATUS.USER_REPORTED_CANCELLED_UNVERIFIED]: '用户自述已取消 · 官方结果未知',
    [STATUS.USER_REPORTED_COMPLETION_UNVERIFIED]: '用户自述已完成 · 未经官方核验',
    [STATUS.USER_REVIEWED_UNVERIFIED]: '用户已手动核对并关闭本地记录 · 扩展未验证'
  };
  return labels[status] ?? '尚未发起';
}
