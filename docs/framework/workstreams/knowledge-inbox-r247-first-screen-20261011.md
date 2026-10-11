# Knowledge Inbox R24.7：编辑保存按钮首屏可见

日期：2026-10-11；目标：`shopable-ai/opendesk-browser` 的 `main`。

## 审计来源

- R24.6 正式通过候选：`1b03a793767c25ec93600ce068e505f5200cc81d`，[Actions 38145182010](https://github.com/shopable-ai/opendesk-browser/actions/runs/38145182010)。定向组件 133/133 PASS，生产/开发构建与包校验 PASS，受控 MV3 Chrome 1/1 PASS，Linux 环境 1,196 PASS、7 SKIP、0 FAIL。受控 fixture 并不是线上 ChatGPT 或用户 Mac 原生验收。
- CI Artifact：`knowledge-inbox-r1-evidence`、ID `11704204251`。截图 `edit-compact-360-light.png` 等宽度和主题证据表明：Markdown 正文已提前出现，但较高的初始 textarea 将底部「保存修改」推到首屏下方。
- 尚无来自实际用户的 Mac 100%/200% 系统缩放、系统剪贴板、Native Workspace 落盘、真实 ChatGPT 网站的独立验证。

## 本轮实现目标

只调整知识收件箱既有 HTML/CSS/测试，保留工具沙箱、可信 Service、`OpenDeskTool.request`、JSON 存储 v1、revision 冲突及原文不可变语义。

1. 正文默认行数由编辑 24/新建 20 改为统一 16，仍使用原生可手动纵向拉伸的 textarea。
2. 原桌面正文最小高度从 `clamp(340px,54vh,680px)` 收敛到 `clamp(310px,44vh,600px)`，小屏从 `clamp(320px,54vh,540px)` 调整为 `clamp(300px,44vh,500px)`。
3. 明确工具内「返回列表」文案，区别工具宿主的顶层返回或关闭。现有未保存内容保护仍生效。
4. 强化组件静态合同和原生 Chrome 的外层 Side Panel 视口断言：`iframe.top + saveButton.bottom < window.innerHeight - 10`（360×869、CSS 像素；不以隐藏 iframe 自身 viewport 判断）。
5. 官方内置工具版本更新到 `1.2.3`，发布包仍由既有 `scripts/build-official-tools.mjs` 生成；不直接编辑 `dist` 或变更既有 build 限制。

## 受影响文件

- `examples/sidebar-tools/knowledge-inbox/src/index.html`
- `examples/sidebar-tools/knowledge-inbox/src/style.css`
- `examples/sidebar-tools/knowledge-inbox/tool.config.json`
- `tests/environment/knowledge-inbox-r24-ui.test.mjs`
- `tests/framework/knowledge-inbox-native-r1.test.mjs`
- `docs/product/chatgpt-knowledge-inbox-r1.zh-CN.md`

## 必须得到的验收结果

- [ ] `npm run check`、`node --check`、定向组件测试
- [ ] `npm run build`、`npm run build:dev`、`npm run verify`，无预算或供应链检测绕过
- [ ] 受控真实 Chrome/CFT：经发现工具安装、授权、保存、编辑、取消、删除、撤权；新增保存按钮在外层 360px 首屏内断言 PASS
- [ ] 实际受控截图（360、400、600、1000 CSS px 和 light/dark）无横向溢出；记录来源 SHA、测试产物
- [ ] 用户 Mac Chrome，含 200% 真实缩放与读屏/键盘路径独立验收，未测不冒充 PASS

## 状态

在本文创建时以上全部为待核查。代码提交、组件检测和原生 Chrome 测试结果必须按同一精确 SHA 与 Actions 日志更新，不因设计预期自行声称“全部专家评分 ≥95”。

## 第一次 R24.7 候选与实际阻塞

- 已提交 [38de908b4270cd0976f9dd5623b563a080e82aac](https://github.com/shopable-ai/opendesk-browser/commit/38de908b4270cd0976f9dd5623b563a080e82aac)，升级包至 v1.2.3。
- [Actions 38146166088](https://github.com/shopable-ai/opendesk-browser/actions/runs/38146166088) 受影响组件 **141/141 PASS**，但生产构建在 `scripts/verify-package.mjs:319` 拒绝了第三方 `libs/packages/axios.js` 内 `this.constructor.concat` 构造函数引用（`offset=10754`），未运行真实 Chrome ；该扫描拒绝来自并行依赖改动，不能在此任务中关闭校验器或假报成功。
- 此次 Actions Artifact `knowledge-inbox-r1-evidence` ID `11705186168` 包含产出的 v1.2.3 源生成官方工具 JSON；**该产物未经完整包校验，不可作为可发布安装包**。

## R24.7.1：解决嵌套 iframe 的 `vh` 意外放大

通过把失败候选 Artifact 的原始 v1.2.3 官方包在本地独立 Chromium 中以 360×869、light/dark 两种模式运行，独立于 Chrome MV3，明确复现：

- iframe 顶部取 94 CSS px 的视觉宿主样例下，`rows=16` 且小屏 `min-height:clamp(300px,44vh,500px)` 实测正文编辑框 **500px**，保存按钮外层下边界 **880.2px**，超过 869px 视口，**NOT PASS**。
- 原因是 iframe 自动按内容增长，导致 `44vh` 相对 iframe 自身膨胀至 clamp 上界，而非用户可见的浏览器视口。继续微调 vh 百分比不能根治。
- 改为显式初始高度：小屏 **328px**、常规 **344px**、宽屏 **460px**；`rows=12`，仍然 `resize:vertical`。本地独立 Chromium 同尺寸 light/dark 验证：正文 **328px**，保存按钮外层下边界 **708.2px**，低于视口 869px，保留约 **161px** 的余量；无横向溢出。该验证属于 `OFFLINE_STANDALONE_CHROMIUM`，不是正式扩展验收。
- 版本升级为 `knowledge-inbox v1.2.4`，静态组件测试与本轮正式 MV3 驱动将检查默认高度、不依赖 iframe-vh 和整页保存按钮可见性。

## 当前交付等级

- [x] v1.2.3 的实际失败及成因已记录，不吞掉旧 CI 失败。
- [x] v1.2.4 的本地独立 Chromium 视觉复测（非扩展环境）通过。
- [ ] 当前 **v1.2.4** 在正式 main 的 production + development build、verify 通过。
- [ ] 当前 **v1.2.4** 真实 MV3 CFT 的全链路、保存按钮首屏断言、截图与撤权通过。
- [ ] 用户 Mac 真实 200% 缩放及在线 ChatGPT、系统剪贴板、Native Workspace 落盘独立测试。

未获得当前精确包的完整 CI 和 Native 证据之前，不宣称“专家评分各维度达到 95+”或最终发行成功。

## R24.7.1 最终受控知识专项证据：成功候选 565554a9

- **精确功能/测试候选**：[565554a97ec44054f141c54b3574e6278546afec](https://github.com/shopable-ai/opendesk-browser/commit/565554a97ec44054f141c54b3574e6278546afec)；官方 `knowledge-inbox` 为 v1.2.4。
- **实际 Actions**：[Run 38147975486](https://github.com/shopable-ai/opendesk-browser/actions/runs/38147975486)，job `114495227769`，其中 `Source and affected components` = **SUCCESS**，144/144 tests PASS / 0 FAIL / 0 SKIP；`Build current production and development extension` = **SUCCESS**（生产、开发构建及 verify）；`Real Chrome and controlled ChatGPT-shaped DOM fixture` = **SUCCESS**，1/1 CFT PASS。整项 Job 因下述全仓环境测试失败，状态仍 **FAILURE**，不得宣称全绿。
- **真实 MV3 Chrome for Testing**：Chrome `155.0.8059.39`，Linux。审阅并安装官方包 → 在工具详情/设置手动授权 ChatGPT 来源 → 捕获/去重/原文保留 → 编辑/标签校验/取消/保存 → 手动创建/删除 → 键盘导航 → SPA 与站点撤权保留存量记录均通过。
- **用户特定首屏验收**：CFT 在 360×869 CSS 视口检查 `iframe.top + #ki-save.bottom < outerWindow.innerHeight - 10`，实际断言 PASS，截图 `edit-compact-360-light/dark.png`、`edit-dirty-360-light/dark.png` 显示保存动作在首屏内。补充本地独立 Chromium 的 360×869 相同对比：旧编辑框 500px / 保存底端 880.2px，修后正文 328px / 保存底端 708.2px；后者只是独立静态 UI 证据，不冒充 CFT 数值。
- **视觉证据**：[Artifact 11705384251](https://github.com/shopable-ai/opendesk-browser/actions/runs/38147975486/artifacts/11705384251)，ZIP 2,452,683 bytes，SHA-256 `87a63a0ece80aeb87137b0525b0b2b355af1ab4c8caeb5e93cf798fcd49eec1a`。52 张 PNG，13 个状态，360/400/600/1000 CSS 宽度、light/dark 两种主题；visual-metrics 共 52 条，**max(scrollWidth - clientWidth) = 0**。官方知识包 JSON 61,478 bytes，SHA-256 `6c189292cb00d97ac569551a6a74d276de2e73edb0b4a1cae6270bb00cb3cdc7`。

### 必须保留的独立全仓环境失败

上述成功候选的 `Environment regression on Linux` 步骤 **FAILURE**：1,245 tests = **1,229 PASS / 9 FAIL / 7 SKIP**。九个失败包括：
- Axios Browser CSP wrapper（1 项）、真实 Axios WXT 生产/开发包（2 项）；
- R15.5 历史 SW 预算断言（1 项）；
- 新版工具导航与旧 Side Panel R21/R23 设计静态断言（3 项）；
- 预装 store 第三方包在 production/development 的测试（2 项）。

这九项不是知识收件箱新增用户功能、编辑页面或本轮 CFT 失败，属于并行第三方类库、SW 预算与工具管理 UI 工作流的历史/交叉断言。**不在此任务擅自重写其他工作流、放宽安全校验或将它们标记 PASS。** 若正式发布要求所有全仓门禁全绿，当前仍需这些专项修复后在统一发行候选上复验。

### 当前阶段结论与专家评分限制

- **R24.7 知识编辑界面、受影响定向组件、生产/开发包、受控真实 MV3 Chrome：专项 PASS。**
- **全仓 Linux 环境：FAILURE（9 项其他模块问题）；最终 F3/ZIP 发行验收：NOT_TESTED。**
- **用户 Mac 在线 ChatGPT、真实 200% 缩放、完整读屏路径、系统剪贴板与 Native 工作区写盘：NOT_TESTED。**

可以根据源码和受控图片将“正文优先信息架构 / 高频操作 / 窄屏首屏”暂评约 95–96；**不能据此把全部无障碍、生产发行和用户 Mac 维度宣称已独立达到 95**。后续优先全仓并行门禁收敛及用户环境验收，知识收件箱不再为测试脚本旧按钮创建第二套业务 UI。
