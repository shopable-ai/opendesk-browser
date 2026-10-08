# D1 页面用户脚本：Linux CFT 环境预检与本地原生验收入口

日期：2026-10-08。本文仅记录一次真实环境预检，以及尚待执行的最短原生验收步骤。它不绑定最终 Git 提交、构建指纹、组件测试数量或正式验收候选。

## 一、结论与证据范围

本次受控 Linux Chrome for Testing 在打开浏览器界面之前，因执行器拒绝创建 Unix socket 而终止。因此，本次没有进入扩展安装、用户脚本授权或网页试运行环节。

| 项目 | 实际结果 |
| --- | --- |
| 浏览器版本 | Google Chrome for Testing 155.0.8059.39，Linux x86_64 |
| 二进制与依赖预检 | `--version` 成功；`ldd` 未发现缺失动态库 |
| 受控 profile | 独立新建，权限 `0700`；未使用个人浏览器资料 |
| Chrome 启动 | `process_singleton_posix.cc:297` 报告 `socket() failed: Operation not permitted (1)` |
| 退出 | 前台执行会话 80549，退出码 134；完成输出报告 signal 6 |
| 最小 socket 诊断 | AF_UNIX / SOCK_STREAM：EPERM；IPv4 TCP、UDP：可以创建 |
| DevTools 端口文件 | 未创建 `DevToolsActivePort` |
| 扩展与权限 | 未加载扩展；未点击 Allow User Scripts；未处理站点授权 |
| 原生脚本执行 | 未调用真实 `chrome.userScripts` 完成页面脚本执行；没有原生运行回执 |
| 清理 | 前台进程已退出；按本次 profile 精确匹配的 Chrome 进程检查结果为空 |

这里的阻断准确范围是 **Chrome 所需 AF_UNIX socket 不可用**，不是“网络全部不可用”，也不是产品功能已经失败。没有通过修改 Chrome 偏好、调用授权写入接口、放宽操作系统限制或制造回执来替代真实操作。

```text
ENVIRONMENT_PREFLIGHT    = BLOCKED_ENV
CHROME_NATIVE_VERIFIED   = NOT_TESTED
USER_FLOW_VERIFIED       = NOT_TESTED
FINAL_FRAMEWORK_ACCEPTED = NO
```

证据保存在同一仓库内：

- [环境预检记录](evidence/d1-20261008/environment-preflight.json)：精确启动命令、版本、profile、工具执行标识、退出码、能力诊断与未执行项目。
- [原始启动 stderr 摘录](evidence/d1-20261008/chrome-startup.exec-stderr.txt)：从实际工具输出逐字保留的初始错误内容；它是 stderr 摘录，不是完整崩溃转储。
- [最小 socket 能力诊断](evidence/d1-20261008/socket-capability.json)：分别创建三类 socket 的实际结果。

证据中的绝对路径、代理端口和工具会话标识属于当时执行环境，用于追溯，不能当作本地启动配置复制使用。浏览器二进制、profile、缓存和个人资料均不进入本证据目录。

## 二、在可启动 Chrome 的环境中做最短定向验收

以下步骤**尚未在本次受阻环境执行**。开始时应记录实际仓库 HEAD、未提交修改、构建命令、被加载产物的标识、浏览器版本和独立 profile。只在受控浏览器中加载本次实际构建，沿用现有本地受控启动约束；不改旧 Mac/F3 验收脚本，不把一次页面调试当成 F3、安装包一致性或正式 Task 安装验收。

### 1. 准备受控页面与真实授权

使用本地 HTTP 服务提供的专用页面，例如 `http://127.0.0.1:43111/d1-userscript.html`，包含 `h1` 和 `id="d1-result"` 的结果元素。页面自身源码可以在加载时保存原始 MAIN 世界引用，供测试前后只读比较：

```html
<h1>D1 dependency fixture</h1>
<output id="d1-result">尚未运行</output>
<script>
  window.$ = function siteDollar() {};
  window.jQuery = function siteJquery() {};
  window.__d1MainReferences = { dollar: window.$, jquery: window.jQuery };
</script>
```

这段内容属于受控测试页面原始源码。不要在测试后临时写入 MAIN 变量制造“未污染”结果，也不要把页面中的任何标记当作 Broker 授权或原生成功回执。

通过浏览器真实界面加载扩展、在扩展详情打开“允许用户脚本”，并授权当前受控网站。进入 Sidebar 的“开发”，展开“网页用户脚本 · 依赖与试运行”。后续点击该区域的“在当前网页试运行 DOM 脚本”，避免误用 Controller 的 `page / params` 运行入口。

界面操作使用真实鼠标、键盘或受控浏览器 Input 输入。禁止通过 DOM 赋值、`element.click()`、合成事件、修改 profile 偏好、`developerPrivate` 授权写入或 `Browser.grantPermissions` 替代用户确认。原生权限弹窗无法真实操作时，应记录阻断。

### 2. 两个不同来源的库，先审核锁定，再执行 async main

在页面脚本入口选择 `async-main`，直接粘贴以下**未保存草稿**：

```javascript
// ==UserScript==
// @name D1 两库页面调试
// @match http://127.0.0.1/*
// @require https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js
// @require https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js
// @run-at document-idle
// ==/UserScript==

async function main() {
  const values = _.uniq([3, 1, 3, 2]).sort((a, b) => a - b);
  const result = {
    mode: 'async-main',
    jquery: $.fn.jquery,
    lodash: _.VERSION,
    heading: $('h1').first().text(),
    values
  };
  $('#d1-result').text(JSON.stringify(result));
  return result;
}
```

此处的 URL 是待验收输入，不表示本次已经联网获取或验证过 CDN 响应。当前实现可以把该精确 jQuery 声明映射到扩展内置资产；审核界面必须如实显示实际来源为扩展资源，不能宣称发生了 jQuery CDN 下载。第二个库必须通过通用 HTTPS 来源，或在单独的本地导入用例中明确标记本地文件来源；不能悄悄替换其来源来假装验证下载链。

按顺序检查：

1. 源码自动出现两条依赖，并保持声明顺序。尚无锁时运行应被拦截，不应产生页面效果。
2. 点击“读取资源并审核”，通过真实权限界面处理实际需要的下载来源授权。下载来源授权与当前网页运行授权分别记录。
3. 查看原始声明、实际来源、SHA-256、大小、许可证已知/未知状态和风险；点击“确认来源并锁定”。只下载、未确认时不能运行。
4. 记录返回的锁 ID 与两条实际 SHA-256。无需保存 Program Revision，直接点击页面试运行。
5. 同时检查浏览器返回的确切文档结果与页面结果元素。预期 jQuery 版本为 `3.7.1`、Lodash 版本为 `4.17.21`、`values` 为 `[1,2,3]`。仅编辑器显示源代码或仅页面存在标记都不足以判定通过。

在页面 MAIN 世界执行只读比较，验证原有引用没有改变：

```javascript
window.$ === window.__d1MainReferences.dollar &&
window.jQuery === window.__d1MainReferences.jquery
```

应保持 `true`。不要把 USER_SCRIPT 世界能使用 `$`，误解为需要改写网站自身的 `$`。

### 3. 未保存修改、离线缓存与下载授权边界

只修改 `main()` 中的输入或返回字段，保留 `@require` 声明和入口模式，继续使用已有锁直接运行；不能要求先保存，也不应重新下载依赖。

然后分别验证两种条件：

- **撤销 CDN 下载授权**：保留受控页面的运行授权，通过真实权限界面撤销 CDN 来源授权，确认授权确实不再有效，再使用旧锁运行。若开发构建的宽泛授权仍覆盖该 CDN，不能把一次无效撤销操作记为通过；应记录该子项未测，或在允许独立授权的受控构建中补验。不要通过改偏好伪造权限状态。
- **离线运行**：让该受控 Chrome 的互联网连接确实不可用，确认一个新的、未缓存 CDN 资源获取会失败；保留本地测试页可用。使用旧锁再次运行，应仍得到一致结果。只把网页标签的 DevTools 切到 Offline，不能自动证明扩展 Service Worker 的下载链已经断网。

观察扩展自身的网络活动，确认运行旧锁时没有重新请求 CDN。关闭并重开开发界面，再选择已有固定版本运行，用以检查持久资产读取。若要另做整个浏览器重启验收，单独记录进程退出、重启、同一 profile、加载产物、权限状态和新原生回执；本文件不预先宣称该项通过。

### 4. 经典顶层脚本必须独立验证

切换入口为 `classic-userscript`。保留两条 `@require`，把正文换成：

```javascript
const d1ClassicValues = _.uniq([3, 1, 3, 2]).sort((a, b) => a - b);

(() => {
  const result = {
    mode: 'classic-userscript',
    jquery: $.fn.jquery,
    lodash: _.VERSION,
    values: d1ClassicValues
  };
  $('#d1-result').text(JSON.stringify(result));
  return result;
})();
```

此代码没有 `main()`，必须以经典顶层/IIFE 语义执行。入口模式属于锁身份，不能把 async-main 锁直接冒充经典入口锁；通过选择可信缓存、审核并建立该入口的锁复用相同资产字节。

在同一文档再调试一次，检查顶层 `const` 没有因世界被错误复用而出现重复声明错误，并再次检查 MAIN 引用。当前产品有每文档调试世界预算；达到界面提示的上限时，应刷新受控页面后继续，不能删除会话账本或改预算伪造通过。停用或刷新对已产生 DOM 修改、监听器的处理，也不能借此推断正式安装生命周期已经验收。

## 三、结果记录与边界

将成功、失败、未测和环境阻断分别记录。原生证据应包含实际候选身份、目标文档、依赖锁/哈希、受信操作过程、Chrome 返回结果及必要的页面观察；不得用组件模拟器输出或手写成功 JSON 补齐。

完成上述步骤至多证明本次候选的页面依赖调试路径。Page Program 正式 Candidate、Verification、Available、安装、自动匹配注册、停用、浏览器重启对账，以及最终 Mac/F3/ZIP 验收，仍须按各自正式合同独立提供证据。
