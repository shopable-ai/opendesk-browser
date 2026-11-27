import { channels, getAction } from '../channels/catalog.js';
import { assertOfficialUrl } from '../lib/guard.js';
import { STATUS, canStartHandoff, createHandoffRecord, recoverHandoff, statusLabel, transitionHandoff } from '../lib/state.js';

const STORAGE_KEY = 'aiBenefitsR1';
const DEFAULT_STATE = {
  aliases: [
    { id: 'self', label: '本人账号（本地标签）' },
    { id: 'target-a', label: '目标账号 A（本地标签）' }
  ],
  selectedAliasId: 'self',
  selectedChannelId: channels[0].id,
  selectedActionId: channels[0].actions[0].id,
  currentHandoff: null
};
let state = structuredClone(DEFAULT_STATE);
let busy = false;
const $ = (id) => document.getElementById(id);

async function loadState() {
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  if (saved[STORAGE_KEY] && typeof saved[STORAGE_KEY] === 'object') {
    state = { ...DEFAULT_STATE, ...saved[STORAGE_KEY] };
  }
  if (!Array.isArray(state.aliases)) state.aliases = structuredClone(DEFAULT_STATE.aliases);
  state.aliases = state.aliases
    .filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string' && !item.label.includes('@'))
    .map((item) => ({ id: item.id, label: item.label.slice(0, 36) }));
  if (!state.aliases.length) state.aliases = structuredClone(DEFAULT_STATE.aliases);
  if (!state.aliases.some((item) => item.id === state.selectedAliasId)) state.selectedAliasId = state.aliases[0].id;
  if (!channels.some((item) => item.id === state.selectedChannelId)) state.selectedChannelId = channels[0].id;
  const channel = channels.find((item) => item.id === state.selectedChannelId);
  if (!channel.actions.some((item) => item.id === state.selectedActionId)) state.selectedActionId = channel.actions[0].id;
  state.currentHandoff = recoverHandoff(state.currentHandoff);
  await saveState();
}
async function saveState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}
function selectedChannel() { return channels.find((x) => x.id === state.selectedChannelId) ?? channels[0]; }
function selectedAction() { return getAction(state.selectedChannelId, state.selectedActionId) ?? selectedChannel().actions[0]; }
function selectedAlias() { return state.aliases.find((x) => x.id === state.selectedAliasId) ?? state.aliases[0]; }
function isBlocking() { return !canStartHandoff(state.currentHandoff); }
function setMessage(message) { $('actionMessage').textContent = message; }

function renderChannels() {
  $('channelSelect').replaceChildren();
  for (const channel of channels) {
    const option = document.createElement('option');
    option.value = channel.id;
    option.textContent = channel.name;
    $('channelSelect').append(option);
  }
  $('channelSelect').value = state.selectedChannelId;
}
function renderAliases() {
  $('accountSelect').replaceChildren();
  for (const alias of state.aliases) {
    const option = document.createElement('option');
    option.value = alias.id;
    option.textContent = alias.label;
    $('accountSelect').append(option);
  }
  $('accountSelect').value = state.selectedAliasId;
}
function renderActions() {
  const channel = selectedChannel();
  $('actionSelect').replaceChildren();
  for (const action of channel.actions) {
    const option = document.createElement('option');
    option.value = action.id;
    option.textContent = action.label;
    $('actionSelect').append(option);
  }
  if (!channel.actions.some((x) => x.id === state.selectedActionId)) state.selectedActionId = channel.actions[0].id;
  $('actionSelect').value = state.selectedActionId;
  $('actionNotice').textContent = selectedAction().notice;
  $('startHandoff').textContent = selectedAction().buttonLabel;
}
function renderStatus() {
  const handoff = state.currentHandoff;
  $('pendingActions').hidden = !handoff || handoff.status === STATUS.USER_REVIEWED_UNVERIFIED;
  $('handoffDetails').hidden = !handoff;
  $('statusTitle').textContent = handoff ? statusLabel(handoff.status) : '尚未发起';
  $('statusDescription').textContent = handoff
    ? '这是扩展本地交接记录，不是官方订单、支付回执或权益状态。'
    : '尚无待确认事务。';
  $('startHandoff').disabled = busy || isBlocking();
  $('acknowledge').disabled = busy || isBlocking();
  if (handoff) {
    const rows = [
      ['商品', handoff.channelId],
      ['动作', handoff.actionId],
      ['目标标签', handoff.accountLabel],
      ['创建时间', handoff.createdAt],
      ['官方入口', handoff.url]
    ];
    $('handoffDetails').replaceChildren();
    for (const [key, value] of rows) {
      const dt = document.createElement('dt'); dt.textContent = key;
      const dd = document.createElement('dd'); dd.textContent = value;
      $('handoffDetails').append(dt, dd);
    }
  } else {
    $('handoffDetails').replaceChildren();
  }
}
function render() {
  renderAliases(); renderChannels(); renderActions(); renderStatus();
}

$('accountSelect').addEventListener('change', async (event) => {
  state.selectedAliasId = event.target.value; await saveState(); renderStatus();
});
$('channelSelect').addEventListener('change', async (event) => {
  state.selectedChannelId = event.target.value;
  state.selectedActionId = selectedChannel().actions[0].id;
  await saveState(); renderActions(); renderStatus();
});
$('actionSelect').addEventListener('change', async (event) => {
  state.selectedActionId = event.target.value; await saveState(); renderActions();
});
$('addAlias').addEventListener('click', async () => {
  const label = $('newAlias').value.trim();
  if (!label) return setMessage('请输入一个本地别名。');
  if (label.includes('@')) return setMessage('请勿输入邮箱；这里只保存本地别名。');
  if (state.aliases.some((x) => x.label.toLowerCase() === label.toLowerCase())) return setMessage('这个别名已经存在。');
  const id = `alias-${crypto.randomUUID()}`;
  state.aliases.push({ id, label: label.slice(0, 36) });
  state.selectedAliasId = id;
  $('newAlias').value = '';
  await saveState(); renderAliases(); renderStatus(); setMessage('已添加本地别名；它不是已验证的官方身份。');
});

$('startHandoff').addEventListener('click', async () => {
  if (busy || isBlocking()) return;
  if (!$('acknowledge').checked) return setMessage('请先确认：最终交易必须在官方页面由授权人员完成。');
  const action = selectedAction();
  const alias = selectedAlias();
  let url;
  try { url = assertOfficialUrl(action.url); }
  catch { return setMessage('官方入口未通过白名单检查，已阻止打开。'); }

  busy = true; setMessage('正在记录本地交接……'); renderStatus();
  const handoff = createHandoffRecord({
    id: crypto.randomUUID(),
    channelId: state.selectedChannelId,
    actionId: action.id,
    accountLabel: alias?.label ?? '未选择',
    url
  });
  state.currentHandoff = handoff;
  try {
    await saveState();
  } catch {
    busy = false; setMessage('无法保存防重复记录，未打开官方页面。'); renderStatus(); return;
  }

  try {
    await chrome.tabs.create({ url, active: true });
    state.currentHandoff = transitionHandoff(state.currentHandoff, STATUS.OFFICIAL_PAGE_OPENED_UNVERIFIED);
    await saveState();
    setMessage('官方入口已打开。付款、赠送、兑换和开通结果均未验证。');
  } catch {
    state.currentHandoff = transitionHandoff(state.currentHandoff, STATUS.HANDOFF_UNKNOWN);
    try { await saveState(); } catch { /* OPENING will recover to HANDOFF_UNKNOWN on next load. */ }
    setMessage('打开结果未知。为避免重复交易，已阻止自动重试；请先在官方页面核对。');
  } finally {
    busy = false; $('acknowledge').checked = false; renderStatus();
  }
});

$('reportCancelled').addEventListener('click', async () => {
  if (!state.currentHandoff || busy) return;
  try {
    state.currentHandoff = transitionHandoff(state.currentHandoff, STATUS.USER_REPORTED_CANCELLED_UNVERIFIED);
    await saveState(); setMessage('已记录用户自述取消；官方交易结果仍未知。'); renderStatus();
  } catch { setMessage('当前状态不能记录取消。'); }
});
$('reportCompleted').addEventListener('click', async () => {
  if (!state.currentHandoff || busy) return;
  try {
    state.currentHandoff = transitionHandoff(state.currentHandoff, STATUS.USER_REPORTED_COMPLETION_UNVERIFIED);
    await saveState(); setMessage('已记录用户自述完成，但没有官方信号，不能显示已付款或已开通。'); renderStatus();
  } catch { setMessage('当前状态不能记录完成。'); }
});
$('reviewed').addEventListener('click', async () => {
  if (!state.currentHandoff || busy) return;
  try {
    state.currentHandoff = transitionHandoff(state.currentHandoff, STATUS.USER_REVIEWED_UNVERIFIED);
    await saveState(); setMessage('本地待确认记录已关闭；扩展仍未验证官网交易结果。'); renderStatus();
  } catch { setMessage('请先记录官网结果，或刷新后重试。'); }
});

await loadState();
render();
