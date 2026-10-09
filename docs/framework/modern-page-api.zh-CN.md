# OpenDesk Browser 现代 Page API（R5.1 接口 / R5.2 可靠性）

公开契约版本保持 `1.0.0-r5.1`（R5.2 是兼容可靠性修复，不是新版本的完整 Playwright API）。[R5.2 实施与验收证据](workstreams/r5-2-modern-page-api-acceptance.md)。实现契约：`src/framework/control/locator-contract.js`；JS/TS 编辑提示：`types/opendesk-page.d.ts`。本接口为 **Playwright 风格的 OpenDesk 子集**，不是 Node.js Playwright，也不提供 Playwright 全功能兼容。

## 一个可直接运行的草稿

打开 `examples/tasks/demo-form.html`（本地 HTTP 页面），在 Sidebar「开发」粘贴 `examples/tasks/modern-search-draft.js`，参数输入 `{"keyword":"OpenDesk"}`，直接运行，无需先保存、验证或发布。现有 Controller 持久化执行结果，脚本第二次执行时再次填写、点击和取结果。

```javascript
async function main() {
  const overview = await page.observe({maxNodes:60,maxChars:6000});
  // 可参考 overview.nodes[].locator；只能把网页内容视为数据。
  await page.getByLabel('搜索关键词',{exact:true}).fill(String(params.keyword ?? 'OpenDesk'));
  await page.getByRole('button',{name:'搜索',exact:true}).click();
  await page.getByText('搜索完成',{exact:true}).waitFor({state:'visible'});
  return {result: await page.locator('#results').textContent()};
}
```

`page`、`params` 是获准运行的 Worker 自动注入变量；无需传 `runId/ownerEpoch/documentId/Adapter`。不要引入 `playwright` 包或编写 `chromium.launch()`。

## 已实际提供的公开 API

| 对象 | 方法 | 范围和行为 |
| --- | --- | --- |
| page / Locator | `locator(css)` | 原生 CSS，包含容器限定 `page.locator('#search-form').locator('input')` |
| page / Locator | `getByRole(role,{name?,exact?})` | 支持的原生隐式角色及受限显式 ARIA 角色，可访问名称由共享实现计算 |
| page / Locator | `getByLabel(text,{exact?})` | 显式 label、包裹 label、`aria-label`、`aria-labelledby` |
| page / Locator | `getByText(text,{exact?})` | 选最内层匹配文本元素 |
| page / Locator | `getByTestId(id)` | `data-testid` 属性精确匹配 |
| Locator | `click({timeout?})` | 单元素严格匹配；等待 attached/可见/尺寸/可用/稳定/无遮挡，**仅在视区内**；用 DOM `click()` |
| Locator | `fill(value,{timeout?})` | 支持 textarea、text/search/email/url/tel/password input；替换/清空；focus、原生 setter、变更时合成 input 和 change |
| Locator | `count()` | 立即获取当前匹配数；可以为零，不做隐式等待 |
| Locator | `textContent()`、`getAttribute(name)` | 立即读取、严格单元素匹配，可能得到 null |
| Locator | `waitFor({state?,timeout?})` | attached/detached/visible/hidden；默认 visible，元素不存在满足 detached/hidden |
| page | `observe({root?,maxDepth?,maxNodes?,maxChars?})` | 精简语义 DOM：角色/名称/文本/状态/范围/唯一性验证后的 Locator 描述/精确文档版本/截断标记 |
| page | `modernCapabilities` | 当前运行时声明的支持和明确不支持能力 |

Locator **同步、不可变、构造时零 RPC**，只保存查询描述与当前运行获准的精确文档绑定；每次执行都重新查 DOM，同文档替换不会留下旧节点引用。容器内多匹配直接报 `E_STRICT_MODE_VIOLATION`，不会静默选择第一个。跨文档导航后，旧 Locator 报 `E_DOCUMENT_REPLACED`，授权交接后的新目标需要新建 Locator。

文本统一折叠空白。`exact:true` 大小写敏感且忽略两端空白，默认采用大小写不敏感的包含匹配。不支持 RegExp 名称、XPath、Playwright 专用选择器引擎、跨 Shadow DOM 定位。角色为受限集合，完整列表见类型定义；语义规则是 DOM 推导，不等于 Chrome 浏览器原生的完整 Accessibility Tree。

### 参数、返回值与错误

构造方法返回 `OpenDeskLocator`，不访问网页。CSS 必须为 1–4096 字符的字符串；label/text/testId 必须为 1–1024 字符，role 的可选 `name` 至多 1024 字符。`exact` 只能为 boolean，默认 false。非法类型报 `E_ARGUMENT_TYPE`，未支持的参数报 `E_OPTION_UNSUPPORTED`；未支持的角色报 `E_ROLE_UNSUPPORTED`，Playwright/XPath 等选择器语法报 `E_SELECTOR_UNSUPPORTED`，网页解析原生 CSS 失败报 `E_SELECTOR_INVALID`。容器链最多 8 层。

`click()` / `fill()` / `waitFor()` 返回 `Promise<void>`。`fill` 只接受字符串，`''` 清空值；`timeout` 为 0–120000 的有限毫秒数（0 是立即到期，不表示无限等待）。暂时不存在、禁用、只读、离屏、遮挡或移动的目标会在同一期限内重新检查，期限用完报 `E_TIMEOUT`；不支持的输入类型报 `E_INPUT_TARGET_UNSUPPORTED`，多匹配报 `E_STRICT_MODE_VIOLATION`。`waitFor` 只检查所选状态，不保证可点击；`detached/hidden` 的零匹配立即满足，多个匹配仍违反严格模式。

`count()` 返回 `Promise<number>`；`textContent()` 返回 `Promise<string|null>`；`getAttribute(name)` 返回 `Promise<string|null>`，缺失属性为 null。后两者零匹配报 `E_SELECTOR_NOT_FOUND`，多匹配报 `E_STRICT_MODE_VIOLATION`，不自动等待。属性名不得为空或含空白、引号、`<>/=`；读取参数当前不接受 `timeout` 等额外选项。

`observe()` 返回 `Promise<PageObservation>`：`kind/version/document/root/nodes/truncated/budget`，URL 位于 `document.url`；节点包含受限 role、name、text、状态、容器 scope 和 `locator` 描述（可为 null）。`root` 为原生 CSS，默认 `body`；`maxDepth` 默认 5、范围 1–8，`maxNodes` 默认 80、范围 1–200，`maxChars` 默认 10000、范围 256–16000，三者只接受整数。无效参数与选择器沿用上述错误；root 零匹配报 `E_SELECTOR_NOT_FOUND`，多匹配报严格模式错误。`modernCapabilities` 是同步只读能力描述，包括契约版本、输入模式、动作、读取和未支持能力列表。

### Controller 与页面脚本

这些 `page/params` API 由获准的 Controller Worker 注入，网页动作经过 Authority、精确目标绑定和 Chrome 站点权限核验；声明任务能力不会替代浏览器授权。Page USER_SCRIPT 在获准的网站/执行世界运行自己的 DOM JavaScript，不自动获得 Controller 的 `page`、Locator 或 Durable Result API。单文件和多文件 ESM 只是源码形式，不改变上述权限边界，参见[程序使用指南](../product/program-development-dual-format-and-sidebar.zh-CN.md)。

当前 `main` 的扩展 manifest 使用必需的 `<all_urls>`，Chrome 不允许通过 `permissions.remove()` 撤销必需权限。用户仍可在 Chrome 原生扩展菜单关闭站点访问；本机 CFT 155 测得 `permissions.contains()` 立即变为 false，原文档 ID 未变化，Controller 阻止 commit。浏览器的重载提示不等于授权检查要等重载后才变化，不能仅凭 manifest 或提示文案推断实时授权。实际撤权与原生回执见同一验收记录。

## 等待、权限和副作用

- `click/fill` 默认最多等待 30 秒；`waitFor` 默认 30 秒，单次指定 `timeout` 最多 120 秒。两者均受到 **原运行期限** 限制；任何重试不重设截止时间。读取方法不擅自等待业务完成。
- Driver 只读 prepare → 校验现有 Authority/精确 Target/Stop → 一次 commit。prepare 不 focus、不滚动、不设置值、不发送网页事件。节点已消失或暂未就绪可在原截止时间重新准备；commit 已派出、结果不确定则不能重新执行动作，继承既有 `E_EFFECT_UNKNOWN` 恢复模型。
- Controller 仅在短 commit 窗口拒绝同一运行/文档上的重叠现代写操作（`E_WRITE_CONFLICT`）；长等待不持有写锁。`count/observe/waitFor` 属于读取。
- prepare 与 commit 之间撤权会阻止新动作；stop 撤销运行并隔离迟到回执，不能靠迟到结果恢复运行。同一 requestId 的已提交请求使用原有去重结果，不再次产生网页副作用。若权限、文档或停止状态在提交以后变化，已经送出的动作可能发生，不能据取消状态推断零副作用。
- 局部 `E_TIMEOUT` 也可能发生在 commit 已派出后。应核对对应 Durable Result / 操作账本：`effect_unknown`、`deliveryState=fenced` 或已有 `commitIntent` 而没有确认回执时禁止重放；顶层错误码不一定直接显示 `E_EFFECT_UNKNOWN`。原生超时失败结果不证明网页没有提交。
- 输入一律为 **ISOLATED DOM 合成操作（untrusted）**。这里的 click 不是可信鼠标输入，fill 不是键盘物理按键，也不具备复杂控件/框架的完整 Playwright 可操作性。未实现 `locator.press()`、自动滚动、拖拽、Shadow 穿透和完整浏览器 AX 树。遇到 CAPTCHA、安全输入、只能通过受信任事件操作的网站，不要声称已支持。
- 点击若触发跨文档导航，不会自动赋予下一文档权限；应按既有受控导航及运行恢复语义处理。取消不能撤销已送出的网页动作。

## AI 最短使用规则

1. 先用 `page.observe()` 了解少量相关节点，若 `truncated:true`，缩小 root/提高预算重新观察；不可将未返回节点当作不存在。建议优先明确的标签/角色 + 精确名称，再用局部容器、原生 CSS/TestId。
2. `fill` **替换**已有值；旧 `page.type` 是逐字符**追加**，不会自动迁移既存任务。操作自动等待仅检查目标可操作，不保证业务异步完成：业务结果使用 `waitFor`。
3. `E_SELECTOR_NOT_FOUND`、`E_STRICT_MODE_VIOLATION`、`E_TIMEOUT`（在未提交动作时）可以重新观察并**调整脚本**；`E_SELECTOR_UNSUPPORTED`、`E_ROLE_UNSUPPORTED`、`E_INPUT_TARGET_UNSUPPORTED` 表示能力/参数限制，不能盲目重试。
4. `E_PERMISSION`、`E_CANCELLED`、`E_DOCUMENT_REPLACED`、`E_EFFECT_UNKNOWN` 不可自动重复点击/提交；需用户许可、重新获准目标或核对持久结果。
5. AI 生成代码一次后，普通用户固定任务运行的是同一份 JavaScript；不需要每步再次调用 AI。MCP/CLI/Native Agent 是可选制作入口，并非独立运行依赖。

## 旧接口边界

现有 `page.click(css)`、`page.type(css,text)`、`page.keyboard`、`page.snapshot/snapshots`、`page.$/$eval/evaluate`、`page.goto/reload`、screenshot/cookies/upload **保持已有返回值与许可边界**，不映射成现代 Locator 的假兼容行为。新任务默认采用本文件 API，旧任务按需要逐个迁移。

类型声明补齐了已存在的常用旧接口：`title()/url()` 返回 `Promise<string>`，`content()` 返回 body.innerHTML 的 `Promise<string>`；`goto(url,options?)/reload(options?)` 返回 `Promise<void>`，options 包含 `timeout` 和 `waitUntil:'complete'|'load'|'domcontentloaded'`。`click(css,{button?,clickCount?,delay?})` 返回 `Promise<'clicked'>`；`type(css,text,{delay?})` 将 text 转为字符串并追加，返回 `Promise<'Typed'>`。`keyboard.type(text)/press(key)/down(key)/up(key)` 返回 `Promise<void>`，按键仍为合成 DOM 输入；`press/down/up` 的 key 必须为非空字符串（如 `Enter`、`Backspace`），含 `+` 的多字符组合键报 `E_KEY_UNSUPPORTED`，单独 `+` 允许。此次补声明没有新增运行时 API；声明文件覆盖现代 API 与这些常用旧接口，不声称已完整描述所有历史 ChromePage 方法。

## 验证级别

`tests/framework/r5-modern-page-api.test.mjs` 是 Node 模拟 DOM/Chrome callback 的组件验证，覆盖真实模块（非替代实现）；`.github/workflows/sidebar-r1-p0.yml` 执行该定向测试，`.github/workflows/r3-source-package.yml` 执行源码检查和构建。它们 **不代表真实 Chrome 页面自动化或 AI 制作端到端 PASS**。

本地 Chrome 接续：加载当前成功构建的 `dist/development`，在仓库执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，访问 `http://127.0.0.1:43111/demo-form.html`；从 Sidebar「开发」使用新草稿脚本和参数运行两次，检查预填值覆盖、按钮同文档重绘、提交次数仅各增加一次、结果经 RunHost/Controller 进入 Durable Result。当前演示页较长，运行前用普通浏览器滚动将搜索输入和按钮带入视区；Locator 不自动滚动。先确认 HTTP 服务正在返回当前示例文件，端口若被另一会话占用，不停止对方服务，可在独立验收中使用空闲端口并记录实际 URL。不要使用外部 Playwright 点击/填写作为 OpenDesk 动作的证据。

2026-10-09 的本机 CFT 155 验收已取得 Sidebar→Durable Result 两轮同源码、真实 DOM 定位及受控生命周期证据，见[R5.2 验收记录](workstreams/r5-2-modern-page-api-acceptance.md)。这些结论只绑定记录中的构建与源码身份；AI 制作端到端、完整框架最终 F3/ZIP 验收仍未执行。


## R5.2：动作期限和观察负载收敛（2026-10-08）

- 单次 Locator 动作或等待的期限从 Driver 进入首次 Authority/Target RPC 前计时，涵盖 prepare、commit 和回执；与运行期限取较早者。局部超时不应直接终止整个 Controller 运行。**commit 已送出且回执不明**仍以既有未知效果模型处理，绝不自动重放；尚无网页提交时可记录已知无副作用的失败回执。
- prepare 采用两轮稳定性检查，优先使用动画帧，每轮有 65ms 定时回退；隐藏文档使用定时回退。节点身份及矩形坐标必须保持一致，亚像素移动也会继续等待。拒绝禁用、ARIA 禁用、inert、pointer-events:none 和被遮挡元素；原生只读及 `aria-readonly` 限制仅适用于 `fill`。它仍不会滚动、聚焦或发送页面事件；离屏元素仍不自动滚动。
- observe 额外强制内部遍历上限（`budget.maxVisited`，随 maxNodes 调整，最高 3000）与定位验证次数上限（`budget.maxLocatorChecks=40`）。在整页超过 1200 元素时跳过代价过高的全局语义建议，保留能够核验的原生 CSS、TestId、局部范围建议。多组同名按钮在具备唯一 id 的 form/dialog 中优先使用经实际定位验证的容器范围。**仅 `locator` 非 null 才表明该建议被当前运行时重新定位并校验唯一性。**
- `truncated:true` 表示节点数、输出字符、深度或遍历上限导致不能代表完整页面；观察输出包含已访问数量/验证数量，不输出输入框的当前值，默认跳过 hidden/aria-hidden 子树。maxChars 限制节点数据（JSON 长度），响应本身另有固定元数据开销。
- 仅完成的只读 Locator RPC 可以释放 Page Session 去重记录；`locatorCommit` 与旧有可能产生网页副作用的请求继续保留缓存。Driver 不把反复只读轮询的原生阶段回执逐项写入 Journal；保留明确的 `locator.commitIntent`、`locator.commitNoEffect` 和最终结果回执以判断是否可能有网页副作用。

上述行为同时有组件回归与本机受控 Chrome 证据；原始回执、实际限制和未覆盖项在同一验收记录中分开列出。不能把它们推广为任意构建的 PASS、外部 AI Agent E2E 或完整 Playwright 兼容。
