// 开发 → 直接编辑 → 自动化；仅在标准 demo-form.html 有意运行。
// params.scenario: text | click | async | locator | fetch | sdk；每组有意运行一次，不自动重放。
// 网络场景可用 params.url 指定新的测试请求；不要重放结果未知的原请求。
async function main() {
  const url = await page.url();
  if (new URL(url).origin !== 'http://127.0.0.1:43111' ||
      new URL(url).pathname !== '/demo-form.html') throw new Error('目标不是标准测试页');
  const read = id => page.locator('#' + id).textContent();
  const click = id => page.locator('#' + id).click();
  const expect = (ok, message) => { if (!ok) throw new Error(message); };
  const scenario = String(params.scenario ?? 'text');
  if (scenario === 'text') {
    const title = await page.getByTestId('sample-title').textContent();
    const text = await read('sample-text');
    const listCount = await page.locator('#sample-list li').count();
    expect(title === '周末阅读清单' && listCount === 3, '文本或列表不一致');
    return {scenario, url, title, text, listCount};
  }
  if (scenario === 'click') {
    const before = Number(await read('click-count'));
    await click('click-button');
    expect(Number(await read('click-count')) === before + 1, '点击次数不一致');
    expect(!await page.locator('#extra-text').isVisible(), '显隐场景须从收起开始');
    await click('toggle-button');
    await page.locator('#extra-text').waitFor({state:'visible', timeout:3000});
    const expanded = await read('extra-text');
    await click('toggle-button');
    await page.locator('#extra-text').waitFor({state:'hidden', timeout:3000});
    return {scenario, clicks:await read('click-count'), expanded,
      hidden:!await page.locator('#extra-text').isVisible()};
  }
  if (scenario === 'async') {
    await page.locator('#delay').selectOption('300');
    await click('request-success');
    await page.locator('#async-done').waitFor({state:'visible', timeout:5000});
    const sameOriginFetch = await read('async-done');
    expect(sameOriginFetch === 'HTTP 200 · 已读取同源 JSON 测试资源', '同源请求未完成');
    await page.locator('#delay').selectOption('3000');
    await click('request-success');
    await click('request-cancel');
    await page.locator('#async-status[data-state="cancelled"]').waitFor({timeout:3000});
    return {scenario, sameOriginFetch, cancel:await read('async-status-text')};
  }
  if (scenario === 'locator') {
    const refused = [];
    const reject = async (label, action, code) => {
      try { await action(); } catch (error) {
        expect(error.code === code, label + ': ' + error.code + ' ' + error.message);
        refused.push({label, code:error.code}); return;
      }
      throw new Error(label + ' 意外被允许');
    };
    const duplicate = page.getByRole('button', {name:'确认记录', exact:true});
    expect(await duplicate.count() === 2, '同名场景须有两个目标');
    await reject('strict', () => duplicate.click({timeout:400}), 'E_STRICT_MODE_VIOLATION');
    expect(await read('locator-duplicate-result') === '等待操作 · 两个同名目标', '歧义点击产生了效果');
    await page.locator('#locator-scope-b').getByRole('button', {name:'确认记录', exact:true}).click();
    await reject('disabled', () => page.locator('#locator-disabled-button').click({timeout:400}), 'E_TIMEOUT');
    await reject('aria-disabled', () => page.locator('#locator-aria-disabled').click({timeout:400}), 'E_TIMEOUT');
    await reject('readonly', () => page.locator('#locator-readonly-field').fill('不应写入', {timeout:400}), 'E_TIMEOUT');
    expect(await page.locator('#locator-readonly-field').inputValue() === '不可覆盖', '只读值被改写');
    expect(await read('locator-cover-count') === '0', '遮挡场景须从零开始');
    await reject('covered', () => page.locator('#locator-covered-target').click({timeout:400}), 'E_TIMEOUT');
    expect(await read('locator-cover-count') === '0', '遮挡点击产生了效果');
    await click('locator-cover-toggle');
    await click('locator-covered-target');
    expect(await read('locator-cover-count') === '1', '解除遮挡后未恰好点击一次');
    await click('locator-late-launch');
    await page.locator('#locator-late-target').waitFor({state:'visible', timeout:5000});
    await click('locator-late-target');
    return {scenario, refused, scoped:await read('locator-duplicate-result'),
      readonly:await page.locator('#locator-readonly-field').inputValue(),
      coveredClicks:await read('locator-cover-count'), late:await read('locator-late-status')};
  }
  if (scenario === 'fetch' || scenario === 'sdk') {
    await page.locator('#api-channel').selectOption(scenario);
    await page.locator('#api-url').fill(String(params.url ?? 'http://127.0.0.1:43111/request-sample.json'));
    await click('api-send');
    await page.locator('#api-status[data-state="loading"]').waitFor({state:'hidden', timeout:12000});
    return {scenario, state:await page.locator('#api-status').getAttribute('data-state'),
      status:await read('api-http-status'), response:await read('api-response'), error:await read('api-error')};
  }
  throw new Error('未知 scenario');
}
