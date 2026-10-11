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
