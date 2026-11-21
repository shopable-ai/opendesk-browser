import assert from 'node:assert/strict';

export async function testCoreUi(page, previewUrl) {
  const base = new URL(previewUrl);
  assert.equal(base.protocol, 'http:');
  assert.equal(base.hostname, '127.0.0.1');
  const run = Date.now().toString(36);
  const activateUrl = 'https://vip.example.com/activate?activation_code=DEMO-VIP-01';

  const load = async (scene, extra={}) => {
    const url = new URL(base);
    url.search = new URLSearchParams({scene, width: '390', run, ...extra});
    await page.goto(url.href);
    await page.waitForSelector('#preview-scene');
  };
  const visible = (id) => page.waitForFunction((id) => {
    const element = document.getElementById(id);
    return Boolean(element?.getClientRects().length && !element.disabled);
  }, id, {timeout: 8000});
  const readText = (id) => page.evaluate((id) => document.getElementById(id).textContent.trim(), id);
  const state = (scene) => page.evaluate((key) => {
    const {calls, receipt, storage} = JSON.parse(sessionStorage.getItem(key));
    return {
      calls,
      receiptId: receipt?.redemptionId ?? null,
      matchingJournal: Boolean(receipt && storage.some(([, value]) =>
        value?.idempotencyKey === receipt.idempotencyKey && value?.accountId === receipt.accountId)),
      historyRows: document.querySelector('#ai-vip-history-list').children.length,
    };
  }, `ai-vip-preview-run:${scene}:${run}`);
  const expectCalls = async (scene, redeem, lookup, sharedSession) => {
    const actual = await state(scene);
    assert.deepEqual(actual.calls, {redeem, lookup, sharedSession, write: 0});
    return actual;
  };
  const connect = async (url) => {
    await visible('ai-vip-connect');
    await page.fill('#ai-vip-service-link', url);
    await page.click('#ai-vip-connect');
  };
  const preflight = async () => {
    await visible('ai-vip-redeem-code');
    await page.fill('#ai-vip-redeem-code', 'DEMO-VIP-01');
    await page.click('#ai-vip-redeem');
    await visible('ai-vip-redeem-confirm');
  };

  await load('connect');
  await connect(activateUrl);
  await visible('ai-vip-redeem-confirm');
  assert.match(await readText('ai-vip-connection-status'), /服务身份与权益已核验/);
  assert.match(await readText('ai-vip-redeem-preview'), /确认后才会兑换/);
  assert.equal((await expectCalls('connect', 0, 0, 0)).historyRows, 0);
  await page.click('#ai-vip-redeem-cancel');
  await visible('ai-vip-redeem-status');
  assert.match(await readText('ai-vip-redeem-status'), /已取消预检，未提交兑换/);
  assert.equal((await expectCalls('connect', 0, 0, 0)).historyRows, 0);
  console.log('PASS 连接服务、预检和取消均未兑换');

  await preflight();
  await page.click('#ai-vip-redeem-confirm');
  await visible('ai-vip-site-account');
  await page.waitForFunction(() => /激活成功/.test(document.getElementById('ai-vip-redeem-status').textContent),
    undefined, {timeout: 8000});
  const confirmed = await expectCalls('connect', 1, 0, 1);
  assert.equal(confirmed.historyRows, 1);
  assert.equal(confirmed.receiptId, 'demo-r1');
  assert.match(await readText('ai-vip-site-account'), /网站体验账号 A/);
  console.log('PASS 明确确认只提交一次，显示当次分配，无自动写入');

  await page.reload();
  await visible('ai-vip-site-account');
  assert.match(await readText('ai-vip-site-account'), /网站体验账号 A/);
  assert.equal((await expectCalls('connect', 1, 0, 1)).receiptId, confirmed.receiptId);
  await page.click('#ai-vip-connection-change');
  await connect(activateUrl);
  await page.waitForFunction(() => /已有有效权益，无需重复激活/.test(document.getElementById('ai-vip-redeem-status').textContent),
    undefined, {timeout: 8000});
  assert.equal((await expectCalls('connect', 1, 0, 1)).historyRows, 1);
  assert.equal(await page.evaluate(() => document.getElementById('ai-vip-redeem-preview').hidden), true);
  console.log('PASS 重载后保留原权益、回执和分配，再接同一链接无新兑换');

  await load('recovery');
  await preflight();
  await page.click('#ai-vip-redeem-confirm');
  await visible('ai-vip-recovery-check');
  assert.match(await readText('ai-vip-recovery-status'), /查询服务端终态，不会重新提交/);
  assert.equal((await expectCalls('recovery', 1, 0, 0)).matchingJournal, true);
  await page.reload();
  await visible('ai-vip-recovery-check');
  const unresolved = await expectCalls('recovery', 1, 0, 0);
  assert.equal(unresolved.matchingJournal, true);
  await page.click('#ai-vip-recovery-check');
  await page.waitForFunction(() => document.getElementById('ai-vip-recovery').hidden &&
    document.getElementById('ai-vip-history-list').children.length === 1, undefined, {timeout: 8000});
  const recovered = await expectCalls('recovery', 1, 1, 0);
  assert.equal(recovered.receiptId, unresolved.receiptId);
  assert.equal(recovered.matchingJournal, false);
  assert.match(await readText('ai-vip-site-account'), /网站体验账号 A/);
  console.log('PASS 回执丢失后原笔待核对，重载不重放，显式查询只读原笔');

  await load('member');
  await visible('ai-vip-login-flow');
  assert.match(await readText('ai-vip-login-flow'), /请联系服务方核对授权，无需重复激活/);
  await visible('ai-vip-login-recovery');
  assert.equal(await readText('ai-vip-login-recovery'),'刷新网站授权');
  await page.click('#ai-vip-login-recovery');
  await visible('ai-vip-login-recovery');
  assert.match(await readText('ai-vip-login-flow'), /请联系服务方核对授权，无需重复激活/);
  console.log('PASS 有效权益缺分配时可刷新网站授权');

  await load('development',{allocation:'expired'});
  await visible('ai-vip-local-connect');
  await page.click('#ai-vip-local-connect');
  await visible('ai-vip-login-recovery');
  assert.match(await readText('ai-vip-login-flow'),/网站会话分配已到期/);
  assert.equal(await readText('ai-vip-member-state'),'额度有效');
  assert.equal(await readText('ai-vip-history-count'),'1 条');
  assert.equal(await readText('ai-vip-login-recovery'),'输入续期码');
  assert.equal(await page.evaluate(() => document.getElementById('ai-vip-site-receive').disabled), true);
  await page.click('#ai-vip-login-recovery');
  assert.equal(await page.evaluate(() => document.activeElement?.id),'ai-vip-redeem-code');
  assert.equal(await readText('ai-vip-history-count'),'1 条');
  console.log('PASS 网站分配到期保留额度与历史，续期入口只聚焦激活码');
}
