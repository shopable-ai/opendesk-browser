# AdBlock · 正式 React 产品（R2.11）

> **唯一正式 UI：** `src/App.jsx`（React JSX）及 `src/main.jsx`、`src/model.js`、`src/layout.css`。改 UI 只改这里。**不要编辑生成的 JS/CSS，也不要编辑历史 HTML 原型。**

## 1.2.4：安装即用与更新保留状态（2026-10-24）

首次审阅安装当前扩展内置的官方包，Chrome DNR 权限与会话已就绪时默认开启，无需第二次开启。正常审阅更新将原有开启状态、网站例外与新包身份和安装代际一并写入并读回核实；延迟到达的安装通知不会关闭保护。用户主动关闭、停用、权限撤销或清理未确认时继续关闭，重新授予权限也不会自动恢复。

保留与内置包的精确内容校验，防止同 ID 的任意导入包获得可信 DNR 能力；删除旧版本哈希特例，不再由状态读取顺带批准升级。正常升级的延续由原 Installer 负责，不增加第二套授权或新权限。正式包已按候选验证与晋升流程同步为 1.2.4；下文 R2 历史记录中的版本和验证范围不代表当前包已完成正式验收。

定向验证覆盖真实 Installer 首次安装、升级和同版本替换、实时存储通知、撤权后再授权、包篡改和新增能力拒绝延续、部分写入和未知结果不重放。Chrome 实际更新及最终状态须单独观察，不能由 Node 测试替代。

本次日常 Mac Chrome 已通过原「扩展 → 广告拦截 → 审阅新版」完成 1.2.3 → 1.2.4，新增和移除能力均为空；未点击全局开关，打开工具即显示「保护已开启」、本站 `chatgpt.com` 过滤开启、68 个离线域名，再次读取状态保持开启。固定加载目录仍为本仓库 `dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，开发服务已连接，构建指纹 `295f2605fbf56a7066ac84ec2bc4fbd3c947a87caf0848a590cf6dc23001a092`。本次未卸载用户原有工具来重测首次安装，也未重复广告网站网络验证或 production 验收；首次安装与安全拒绝场景由定向 Node 测试覆盖。`adblock-r12` 与 `sidebar-tools` 合计 131 通过、1 项历史测试跳过，源码检查通过；额外运行的官方目录测试有三处与本次无关的旧断言失败，未扩改其他工具。

## 文件与职责

| 位置 | 当前职责 | 手工编辑 |
| --- | --- | --- |
| `src/App.jsx` | 唯一产品 React 视图、操作反馈、页面/工具切换失效处理 | 是 |
| `src/main.jsx` | 唯一 React Root 装载与卸载 | 是 |
| `src/model.js` | 纯业务状态、Host 回读一致性判断 | 是 |
| `src/layout.css` | 局部产品 CSS，配合已有共享 UI | 是 |
| `src/index.html` | 正式安装包的根容器 | 是 |
| `dist/tool.js` / `dist/tool.css` | Vite 自动生成的正式包资源，`dist/` 被 Git 忽略 | **否** |
| `dist/build-ready.json` | 源码、产物 SHA-256 和确定性 buildId；打包校验，禁止复用旧候选 | **否** |
| `tool.config.json` | 正式安装身份、版本和生成资源路径 | 是 |
| `trusted/` / `rules/` | 既有可信权限、Chrome DNR 生命周期及过滤规则 | 是，须独立安全评审 |
| `adblock.opendesk-tool.json` | 唯一已晋升的正式发行包，与日常生成候选**不是一回事** | **只能候选晋升，禁止手改** |
| `preview/index.html` | R1 已批准的、固定哈希、纯 HTML 历史设计 | **否** |
| `artifacts/previews/adblock/` | 使用正式 React 包生成的离线交互预览；Git 忽略 | **否** |

已废弃的 React + HTM 平行预览、HTM 供应商副本、过期 `src/main.js` 与 `src/style.css`、项目根目录大尺寸生成快照均不再作为当前开发入口。历史原型可在 `preview/index.html` 查看，历史迁移依据可使用 Git 历史及 `REQUIREMENTS.zh-CN.md` 查阅。

## 从干净 checkout 构建

仓库根目录（Node 22.12+，已经执行 `npm ci --ignore-scripts`）：

```bash
node scripts/build-adblock-react.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/adblock --out artifacts/sidebar-tools/adblock/candidate.opendesk-tool.json
node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/adblock
npm run build
```

`node scripts/build-adblock-react.mjs` 使用仓库锁定的 Vite 7 + React 19 JSX 编译配置；React Runtime 与共享 `@opendesk/ui` 由宿主提供，不注入第二份 React。生成 JS 和 CSS 都在 `dist/`，与手工源码物理隔离。`npm run build` 会先重新编译 AdBlock，再读取正式 Catalog 和打包官方候选，因此干净 checkout 不依赖先前机器的 `dist/`。

同一份 `build-ready.json` 会检查 `App.jsx`、入口、业务模型、CSS、HTML、配置和编译后 JS/CSS。源码更新但未重建、字节被改或缺少记录都不能被打包/预览/本地暂存；不会静默发布旧 JS。相同源码和编译字节应生成相同 buildId。

## 正式 JSX 同源交互预览

先生成宿主固定 Shared UI 资源，再用正式产品包生成 HTML：

```bash
npm run build
node scripts/preview/build-preview.mjs --tool adblock --surface side-panel --scenario success --theme light --width 360 --height 760
open artifacts/previews/adblock/side-panel-success-light-360.html
```

预览输出文件名以构建脚本实际结果为准，也可以传 `--out artifacts/previews/adblock/review.html` 后直接打开它。预览加载的是 `dist/tool.js` 与 `dist/tool.css` 对应的**正式 React 组件**，另有预览专用 `scripts/preview/adblock-mock.js` 只模拟 SDK 回执；它不能证明网络广告真正被 Chrome DNR 阻断。

建议同时使用 320/360/400/440px、浅色与深色、键盘切换；真实 Chrome 预览测试入口为：

```bash
node scripts/tests/adblock-preview-chrome.mjs artifacts/preview-chrome
```

## 用户手动屏蔽网页元素 · 新增业务源码（待发布验证）

- **交互**：在正式 React 的「当前网站」卡点击「选择网页元素」，再在目标网页**单击即隐藏**，没有预览或二次确认。误选仅在侧边栏使用「撤销」，网页不显示文字浮层、撤销按钮或成功 Toast；Esc 和侧栏取消只退出本次选择。
- **持久化**：规则按精确 hostname + 安全 CSS 选择器写入独立的 `chrome.storage.local` 键 `opendesk.adblock.cosmetic.v1`，写入后真实读回。下次刷新/重新打开网页自动应用 CSS，动态插入的匹配元素也由样式表处理；恢复操作会永久删除对应本地规则。
- **复用现有运行链**：`src/entrypoints/page-relay.js` 的唯一 `initAdblockCosmetics` → `trusted/page.js` → `trusted/cosmetic.js`；新增 `trusted/picker.js` 仅处理真实网页点击，`trusted/cosmetic-policy.js` 验证存储和选择器。既有固定网站样式和 DNR 规则继续保留。后台 `trusted/service.js` 在原 Web Lock 内核对安装/页面/权限并保存/撤销，无新权限、无第二个 Host 或隐藏引擎。
- **限制与恢复**：仅当前普通 HTTP(S) 主文档；按站点隔离，上限 35 条/站点、300 条总计。用户停用 AdBlock 或将网站加入例外时暂停隐藏，但**保留**已保存规则；重新开启后恢复应用。损坏的手动规则数据不得覆盖修复，网络 DNR 独立继续工作。页面结构大幅改变时，旧选择器可能不再匹配，需要重新选择并清理旧规则。
- **验证边界**：本次代码变更属于未发布的新业务源码。必须执行 `node --test tests/environment/adblock-manual-picker.test.mjs tests/environment/adblock-cosmetic.test.mjs tests/environment/adblock-page-policy.test.mjs`、`node scripts/app-ci.mjs node adblock`、React 构建、同源预览和真实 Chrome 交互/刷新/重开/撤销/升级测试；没有实测结果不能称 PASS。唯一正式发行包 `adblock.opendesk-tool.json` 仍为此前 1.2.1，需按仓库打包晋升流程在所有门禁通过后更新，**禁止手改编译产物或旧包**。

## R2.4：侧边栏管理与高级 CSS 的源代码候选

- **网页仅负责选择和蓝色框**：单击后通过原有可信 Service Worker 保存；侧边栏显示会话状态、失败、结果未知与可永久撤销的回执。网页不提供撤销或文字提示。
- **历史规则**：读取本站真实 `chrome.storage.local` 规则；可以「定位」（短暂揭示、蓝框高亮、自动恢复）、「临时显示 / 重新隐藏」（当前文档）、永久删除（存储读回确认）。
- **高级编辑**：默认折叠；使用共享 `trusted/cosmetic-policy.js` 校验受限 ID、DOM 路径和广告相关 class；必须真实检查匹配量，0 个需主动许可，超过 15 个拒绝保存；原子替换保留旧数据格式。
- **安全审批**：高级 CSS 添加/修改走可信 Host 二次确认，不可进入普通只读检查快捷分支。撤销、定位不修改 Chrome 网络 DNR。
- **交付边界**：GitHub 源码修改不等于浏览器安装成功。只有构建、App CI、源代码同源预览与真实 Chromium 运行链验证完毕，才能晋升独立正式安装包。正式发行包版本与源码候选版本须分别核对。

## 真实产品与安全边界

安装包的 `adblock.control` 仅经原有可信宿主授权运行。Chrome DNR 所有权、权限、安装身份、状态读回、取消、停用、卸载、失败回退均由 `trusted/` 和宿主原流程负责；沙箱 JSX 不调用 `chrome.declarativeNetRequest`，不承担授予权限的职责。AdBlock 只清理自己的规则 ID 741000–741199，不能覆盖 Stay Focus 的规则或解除其它应用的限制。

固定离线名单当前 68 个域名，不宣传未经实测的请求拦截数。网站例外仅在当前受支持 HTTP(S) 标签页身份核实后可修改；导航期间旧请求结果不可用于新网站。规则更新后的真实效果应通过独立 Chrome 网络请求与 DNR 读回验证。

网络层使用 Chrome DNR 阻止匹配请求。规则 `2026-10-21.1` 根据 JavBus 首页实际请求补入 `jads.co`，并以自有 ID `741199` 仅拦截 JavBus 发起的 `/forum/data/attachment/forum/ads/` 图片请求；普通封面、导航/搜索脚本和其它网站不受该路径规则影响。网站例外保持更高优先级，同时修复带末尾点域名的归一化与例外匹配不一致。

页面层由固定编译的可信 ISOLATED 脚本，在 `javbus.com` / `www.javbus.com` 上为广告容器 `.ad-box` 添加 `display: none !important`。不删除 DOM、不注入网站 MAIN 脚本、不接受沙箱传入任意选择器。页面只读取现有 AdBlock 安装哈希、撤权 epoch、总开关、网站例外、真实顶层文档和 Chrome 来源权限核验后的策略；关闭、例外或停用时撤除自己的样式。旧文档结果和超时后的响应不能重新启用样式；权限推送丢失时还有定时复核，因此不承诺所有撤权情况下零延迟移除。CSS 只负责隐藏占位，网络阻断仍由 DNR 执行。网站可以从资源失败或元素可见性推断广告拦截，不能保证无法被检测。

本次使用当前源码生成的规则在独立 Chrome 149.0.7827.55 中检查真实首页：12 个广告图片元素均未加载、3 次广告脚本请求被阻断、30 个正常封面全部加载；加入本站例外和全局关闭后，12 个广告图片及 3 个广告 iframe 恢复加载，未出现拦截检测提示。规则匹配同时检查了正常资源、伪造域名、其它发起站点及末尾点域名。临时原始回执见 `artifacts/adblock-javbus/engine-receipt.json`（Git 忽略）。这是当前规则的真实引擎及网站验证，不替代已安装产品 UI、production 安装或正式验收；下方 1.2.1 安装记录仍是此前候选的历史证据。

2026-10-21 已完成本次开发目标：日常 Mac Chrome 155.0.8059.85 实际加载本仓库 `dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，继续使用原 watcher。首次生效观察指纹 `e0633710541f9f9a261587b1b360743b6bd1f7d74ba2294ff3635cbad1a7726b`；收尾时并行开发已更新为 `8d191f1c000691780d04dafd53f177944d7942c8beffcf108aea898fac45e1a8`，本次广告拦截源码未变。真实界面显示 68 域名，刷新后广告与占位消失，正常封面、导航、搜索入口保留；DevTools 记录 15 条广告资源 `ERR_BLOCKED_BY_CLIENT`。网站例外、全局关闭均恢复广告，恢复过滤后再次消失；从扩展列表停用应用后样式撤除、刷新可重新加载广告。恢复应用保留关闭状态，重新确认开启后过滤恢复，最终全局/本站开启、例外为空。截图与回执位于 `artifacts/adblock-javbus/system-chrome/` 和 `system-chrome-receipt.json`（均为 Git 忽略的本机证据）。正常封面 30/30 的 DOM 与加载计数来自上述独立浏览器检查；日常 Chrome 仅核对可见正常封面，未读取其完整 DOM 计数。

此前日常 Chrome 仍显示 67 域名的原因也已定位：共享官方工具 CSS 校验被 `prompt-shortcuts/src/style.css` 中未使用设计 token 的颜色阻断，发布器保留了旧的开发指纹。将该颜色替换为既有 `--od-line` token 后，原 watcher 自动完成安全更新，无需替换加载目录、重装或放宽校验。测试全程未开启“允许 Apple 事件中的 JavaScript”。定向测试 97 项中 96 通过、1 项历史入口跳过，覆盖网络规则、CSS 所有权、身份/权限、旧响应及 BFCache。单独撤销 Chrome 来源权限和 production 安装验收未实测，不由本次开发证据代替。

## CI 与发布状态（以最新执行结果为准）

### R2.7 核心操作验证（2026-10-21）

- **持续开发核心链 PASS**：隔离 Chrome for Testing 155.0.8059.39 加载既有 `dist/development`（扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`），实际安装并打开 React 应用，经侧栏选择、网页蓝框、真实单击隐藏、Host 保存、本地存储读回、侧栏撤销及刷新恢复。该证据属于 `DEVELOPMENT_CORE_ONLY`，不证明 production 安装或 1.2.2 正式升级。
- **长网页定位修复并实测**：平滑滚动后蓝框与目标的顶部偏差由 1872.5px 降为 0px；框跟随目标、到期恢复隐藏，持久规则不变。定位使用既有页面引擎，取消、撤权和销毁会清理动画帧。
- **高级 CSS 核心链 PASS**：真实界面拒绝危险选择器和 16 个匹配；0 匹配规则经明确选择后可申请保存。Add 等待真实 Host 确认 9 秒后成功，Replace 经 Host 确认后原子替换并读回存储。桥接复用现有 120 秒确认等待与结果未知保护，避免原 8 秒 RPC 超时先于用户确认；未加入自动重试。
- **自动检查**：React 编译及 Build Receipt PASS；AdBlock Node 套件 331 PASS、1 SKIPPED、0 FAIL；`npm run check` PASS。`app-ci node adblock` 最后因缺少完整构建生成的 `candidate-receipt.json` 退出，整个 App CI 不能记为 PASS。更新了与当前 React 入口不符的测试驱动和共享预览外壳断言；正式 Native 驱动仅完成语法核对。
- **发行阻断**：保留已有 watcher，在独立源码快照执行 production 构建，当前先被 `prompt-shortcuts/trusted/asset-contract.js` 的固定可信来源校验拒绝。责任归属 Prompt Shortcuts / 共享固定构建来源审查；未修改该产品或 Web Clipper 的来源锁。Issue #76 保留历史阻断证据，不能据此称最新构建仍停在同一文件。
- **未执行的门禁**：AdBlock 正式同源 HTML / Chromium 为 `PREVIEW_NOT_TESTED`；production Mac Chrome DNR、重启、同 ID 升级、撤权卸载与 Stay Focus 共存验收为 `NOT_TESTED`；五维正式专家评分为 `NOT_SCORED`。共享 Quick Notes 外壳的同源及浏览器检查通过，不替代 AdBlock 正式预览。
- **本机原始证据**（Git 忽略）：`artifacts/adblock-r27-core/core-report.json`、`advanced-core-report.json`、`long-locate.png`、`app-ci-node-final.log`、`production-snapshot-local-deps.log` 与 `verification-summary.json`。测试基于 `0ae7533a16fc4d21e0b34f0db3a1de2d7bb72b97` 加本轮改动；证据摘要保留输入指纹。候选仍为 **1.2.2**，唯一正式包仍为 **1.2.1**，没有晋升或启用发布任务。

```bash
node scripts/app-ci.mjs build adblock
node scripts/app-ci.mjs node adblock
node scripts/app-ci.mjs browser adblock
node scripts/app-ci.mjs native adblock
```

后两项要求真实 Chrome/真实 macOS 环境和对应回执；Node/Mock/离线预览通过绝不冒充真实拦截成功。升级保留已有数据和安装身份；同版本不同字节不能静默覆盖正式包。

当前开发源码 `tool.config.json` 为 **1.2.2 候选版本（未发布）**；仓库唯一正式安装包 `adblock.opendesk-tool.json` 仍为 **1.2.1**，须通过 App CI + Native Mac Chrome 校验再显式晋升。下列 1.2.1 数据是历史发行记录。2026-10-20 按现有打包器完成候选、定向测试和显式晋升；包 SHA-256 为 `8bdb91a0a613932e76d69953b06af3752d217eaee3e15e96e8e27ee314cdbc35`，与本次持续开发扩展 `dist/development/official-tools/adblock/adblock.opendesk-tool.json` 逐字节一致。

旧项目包 **1.2.0**（SHA-256 `a7cfbf0dd773534a2aeb13b44064cfa26869c56eacdf0f9425728663bbd3a8fd`）与当前扩展固定资源不一致，导入时会被拒绝为 `E_TOOL_RUNTIME_UNAVAILABLE`。应重新选择本目录当前唯一正式包；保留固定发行哈希校验，不通过改版本字符串、卸载或放宽来源检查解决。

2026-10-20 历史安装记录：真实 Mac Chrome 开发环境已验证导入 1.2.1、确认安装、打开 React 应用、开启全局过滤、添加当前网站例外及恢复过滤。实际加载路径为本仓库 `dist/development`，扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，当时指纹为 `959fb62e599042064653df5de816619f4fc2ed2838ccd289e032fffa0635fcf0`。该次临时网络对照页未取得请求阻断证据；本次 JavBus 开发验证见上文，不将新证据追记为旧候选通过。production 安装验收与独立 95 分验收仍为 `NOT_TESTED`。后续工具 UI 源码修改继续走候选验证后显式晋升，不自动覆盖此正式包。
