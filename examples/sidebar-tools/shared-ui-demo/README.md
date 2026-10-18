# Shared UI Demo · 持续开发与手动导入

当前默认阶段是**持续开发测试**：Chrome 加载本仓库 `dist/development`，复用已有 `npm run dev` watcher。仓库根的 `npm run build:dev` 和 `npm run build` 分别生成静态开发包和 production 包，不作为日常测试步骤。运行方式、开发连接和安全更新机制见[持续开发指南](../../../docs/framework/extension-development-r131.zh-CN.md)。

## 先看哪些文件

| 要做什么 | 文件 / 目录 |
| --- | --- |
| 手动导入 Demo | [shared-ui-demo.opendesk-tool.json](shared-ui-demo.opendesk-tool.json) |
| 查看或修改开关业务 | [src/App.jsx](src/App.jsx) |
| 查看 Root 挂载与卸载 | [src/main.jsx](src/main.jsx) |
| 查看共享 Card / Switch | [共享组件目录](../../../src/ui/react/components/ui/) |
| 核对日常 Chrome 加载目录 | 仓库根 `dist/development` |

## 现在手动测试

1. 在 `chrome://extensions` 确认日常 OpenDesk 加载目录为 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。在 Side Panel「调试 → 本地开发服务」查看真实连接状态与构建指纹。已有 watcher 时继续复用；仅看进程运行或出现「调试」Tab，不能认定开发客户端已经连接。
2. 打开「扩展 → … → 导入本地工具包」，选择本目录唯一的 `shared-ui-demo.opendesk-tool.json`，完成安装审阅，再打开「广告拦截演示」。若已安装同 ID、版本和 SHA 的包，可直接打开测试，保留已有安装数据。
3. 点击开关，验证「已关闭 → 已开启 → 已关闭」；使用 Tab 聚焦、Space 切换，检查焦点环。
4. 返回列表后重新打开，验证能够继续操作；记录实际错误和复现步骤。

可导入包：`shared-ui-demo` / `1.0.0` / **1,480 字节**，能力列表为空。本次文档修正已重新核对文件字节：

```text
SHA256 fa9f95e9660e00b88963c40792629e26badfe728fb4fc95b1db9ccc70d416a3b
```

**当前证据边界（2026-10-18）：** 包存在、身份与 SHA 已核对；日常 watcher 进程及 development 共享资源存在。本次没有操作日常 Chrome，因此其实际加载路径、扩展 ID、serve 连接和上述手动操作均为 `NOT_TESTED`。下方 R1.9 production 成绩只属于当时的独立候选。

这是独立 Sidebar Tool；只模拟「已关闭 → 已开启 → 已关闭」，不启用 DNR、不修改正式 AdBlock，也不添加任何 Chrome 权限。

## 开发者只写 JSX

`src/App.jsx` 是唯一业务组件，直接从 `react` 和 `@opendesk/ui` 导入 Hooks、Card、CardContent、Switch。启动模板 `src/main.jsx` 内部管理 React Root 和 `pagehide` 清理。工具作者不需要资源加载器、运行时 URL、CDN 或自行管理 React Root。

- **React 19.2.0**：浏览器固定发布的 `libs/page-frameworks/react-19.2.0.js`，经 `src/libs/page-frameworks/contract.js` 校验 SHA256 与文件字节；工具包不携带 React/ReactDOM。
- **Card/CardContent**：基于 shadcn/ui 官方 React Aria Card 源码，局部适配既有 OpenDesk 语义 Tokens。
- **Switch**：基于 shadcn/ui 官方 React Aria Switch 结构，行为使用真实 `react-aria-components@1.22.1`；React Aria 随浏览器固定的 `sidebar-shared-ui.js` 资源发布，**不**进入工具 JSON。
- 上游第三方许可证：`docs/contracts/licenses/shared-ui-third-party-notices.txt`，随浏览器发布至 `licenses/shared-ui-third-party-notices.txt`。

## 修改 Demo 源码后：只编译工具

仅手动导入现有正式 JSON 时无需重新编译。修改 `src/App.jsx` 后，已有浏览器 watcher 不会替你更新已安装的工具包；使用本项目的 Vite 编译与原打包器，生成临时候选并定向验证。这里的 `--prefix` 只编译 Demo 的 JSX，不运行仓库根的扩展构建。共享浏览器资源由已有 watcher 更新，使用同一个 `dist/development`：

```sh
OPENDESK_SHARED_UI_EXTENSION_DIR=dist/development npm run build --prefix examples/sidebar-tools/shared-ui-demo
OPENDESK_SHARED_UI_EXTENSION_DIR=dist/development node --test tests/environment/sidebar-shared-ui-r16.test.mjs tests/environment/sidebar-shared-ui-r17.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --out artifacts/sidebar-tools/shared-ui-demo/local-candidate.opendesk-tool.json
# 本次范围的编译、包和定向测试通过后晋升；原生未测继续写 NOT_TESTED：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --promote-from artifacts/sidebar-tools/shared-ui-demo/local-candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --check-project
```

**正式安装包只允许一个**：`shared-ui-demo.opendesk-tool.json`。若任一步 FAIL，不创建或晋升正式包。若源码修改导致正式包内容变化，先按既有版本规则更新 `tool.config.json`，禁止同版本不同内容的静默覆盖。晋升通过不代表已在当前 Chrome 安装或运行。首次尝试在 `dist` 产物缺失时运行 R1.6 会 SKIP；只有 R1.7 的强制产物测试通过才算包体编译验证。

`OPENDESK_SHARED_UI_EXTENSION_DIR` 相对当前源码树的仓库根解析，缺省为 `dist/development`，工具编译和 R17 测试必须选择同一目录。只有当前任务明确要求静态包验收时，才另外冻结候选并选择对应 `dist/production`；不得覆盖正在运行的日常 watcher 输出。切换候选或修改源码后，只重新编译和验证受影响部分。

## 同源预览与实际安装的界限

Vite `closeBundle` 从选定 WXT 输出逐字节暂存固定 React、`sidebar-shared-ui.js`、`ui/design-tokens.css` 和两份许可证到本工具忽略目录 `.opendesk-preview/browser/`。缺失文件、空资源或 React 字节数/SHA 与既有合同不符均构建失败，不回退到其他目录；失败构建不留下旧 receipt。最后写入 `receipt.json`，包含选定扩展目录、manifest、当前工具源码、Vite JS/CSS 与暂存资源的字节数和 SHA256。构建中源码漂移会拒绝暂存，R17 再核对当前源码、应用输出、原 WXT 资源与暂存字节一致。

`preview/index.html` 只加载这些暂存的真实浏览器资源和原 `../dist/tool.js`、`../dist/tool.css`，直接打开该固定 HTML 即可预览；没有另一套业务 JSX、运行时或模拟开关。`OpenDeskTool` 仅提供预览根节点，不提供宿主请求接口或可信权限。独立 HTML 的开关交互不能代表已安装插件通过。

Headless Chrome 源码同源预览校验：

```sh
CHROME_BIN=/path/to/chrome node scripts/tests/shared-ui-r17-preview-chrome.mjs artifacts/sidebar-tools/shared-ui-demo/chrome
```

该脚本覆盖 320/360/400/440 宽度与明暗主题、点击状态回转、键盘输入、React Root 卸载和无 CDN。以上只能记为 `SOURCE_BOUND_CHROME_PREVIEW_PASS`。浏览器扩展真实安装/导入/Side Panel 生命周期必须单独取 Chrome 证据；本地 Mac 未运行则明确标记 `NOT_TESTED`，不能用预览代替。

CI：`.github/workflows/shared-ui-r17.yml` 使用真实 npm 锁文件与 WXT/Vite 产物，production 输出选择通过相同环境变量传入。候选哈希清单应包含 `dist/tool.js`、`dist/tool.css` 和 `.opendesk-preview/browser/` 内上述五份资源及 `receipt.json`；Chrome、候选晋升与原始日志由验收流程绑定同一候选，不能仅凭暂存成功判定通过。只共享跨工具发布的 **文件字节**，同一工具 Sandbox 内使用同一个 React 实例，不把用户 JSX 交给可信 Host 的 React Root。

## AI 报告怎样核对

每次只接受能对应到本次环境的结论：**运行模式 / 实际扩展路径与 ID / serve 连接状态 / 工具包版本与 SHA / 执行的命令及退出码 / 真实操作结果 / 证据文件 / 失败和未测项**。没有拿到的字段明确写 `NOT_TESTED`，不能由另一列的 PASS 推断。

继续推进时先核对上面的包与持续开发连接，再完成四步手动测试；失败则保留原错误，修复最小范围并重测失败步骤。文档修正只查内容、链接与身份，不触发扩展构建或浏览器验收。生产快照、预览结果和 AI 分数不能代替当前开发环境的操作结果。

## R1.9 静态 production 历史证据（独立候选）

以下是此前显式要求双构建及 production 原生验收时的记录，保留原始候选身份；不表示当前日常 Chrome 已通过。Mac Chrome for Testing 155.0.8059.39、独立 Profile、production 候选通过真实文件安装、三轮交互、管理页 Reload 和实际 200% 缩放；其中两次关闭直接观察到 Root 容器清空。唯一正式包与该候选逐字节相同，业务字节未改。见 [R1.9 证据](../../../docs/framework/evidence/shared-ui-r19-mac-20261018/summary.json)与 [R1.8 历史证据](../../../docs/framework/evidence/shared-ui-r18-mac-20261018/summary.json)。

208 项不同 Node 用例通过、0 失败/跳过（指定 40 项、宿主与启动兼容 109 项、Prompt Shortcuts 来源回归 59 项）。原有 React/Vue Starter 真实编译和包校验通过。源码同源预览 8 项通过；预览的 200% 缩放为 `NOT_TESTED`，原生安装的 200% 为 `PASS`，不互相替代。

实测未压缩字节：Demo JS 1,008、CSS 100；相同 JSX 独立打包基线 JS 235,348、CSS 3,419。单工具 JS/CSS 减少 237,659 字节（99.54%）。浏览器另有既存 React 193,163 字节、共享 UI JS 61,389 字节及共享 UI notices 12,986 字节；上述百分比仅比较单工具，不把共享资源当作免费。

```sh
CHROME_BIN=/path/to/GoogleChromeForTesting \
OPENDESK_SHARED_UI_EXTENSION_DIR=artifacts/shared-ui-r19/build-snapshot/dist/production \
OPENDESK_SHARED_UI_TOOL_FILE=artifacts/sidebar-tools/shared-ui-demo/local-candidate.opendesk-tool.json \
node scripts/tests/shared-ui-r17-installed-chrome.mjs artifacts/sidebar-tools/shared-ui-demo/local-installed-chrome
```

原生重载走 `chrome://extensions` 的真实 Reload 按钮，并核对路径、可信点击、新 worker、新原生文档及持久安装包 SHA。三轮真实打开至可操作为 127.9 / 112.6 / 287.4 ms，点击至动画稳定为 153.7 / 149.6 / 155.3 ms，包含 CDP 往返；不是单独 React 渲染基准。各轮记录 Sandbox 初始堆及关闭后宿主 GC 堆，不跨 isolate 比较，也不据三轮数据宣称长期无泄漏。此 Mac CFT 的命令行加载候选使用 `chrome.runtime.reload()` 后出现 `ERR_BLOCKED_BY_CLIENT`，两次失败完整保留；不将此路径记为 PASS。浏览器进程重启、长期泄漏压力和本轮 Linux 安装均为 `NOT_TESTED`。本轮不提交或推送。

独立证据复评八维为 95 / 96 / 96 / 96 / 96 / 96 / 95 / 96，等权总分 95.75。当前唯一最终结论为 [独立报告](../../../docs/framework/evidence/shared-ui-r19-mac-20261018/independent-review.json) 的 `finalReview`；原 94.5 初审与中间评审保留供追溯。评分仅覆盖本次 Demo 与指定候选验收，不构成全产品、人工无障碍或长期无泄漏认证。

## R1.9 最新本地 main 复验（本轮独立 production 候选）

本轮绑定 `main@247ee2793776f381a1fe178e646e7bb8ab8ee7f2`；为保留正在运行的日常 watcher，双构建在普通 APFS 源码快照完成，未覆盖 `dist/development`。双构建、verify、846 文件源码检查、指定 40 项及宿主/启动兼容 109 项全部通过，0 失败/跳过；React/Vue Starter 真实复编和包校验通过。宿主测试两处 fixture 补齐三个已存在的安装回执 DOM 节点，并将过时 JSON 错误文案改为完整字符串断言；生产业务、公共 Runtime 和工具包字节均未改。

Mac Chrome for Testing 155.0.8059.39 独立 Profile 的真实 Side Panel 文件导入/审阅、三轮鼠标/键盘/ARIA、关闭重开、管理页 Reload 和实际 200% 浏览器缩放通过；预览另外 8 项通过。正式包、候选和实际安装 SHA 相同，`--promote-from` 返回 `unchanged: true`，`--check-project` 通过。原始失败、退出码、源码/产物 Hash、截图及未测项保留在[本轮完整证据](../../../docs/framework/evidence/shared-ui-r19-recheck-20261018-01a14f00/summary.json)。这仍不代表日常 Chrome 的路径、ID 或 serve 连接已验收；长期泄漏、浏览器进程重启及本轮 Linux 安装为 `NOT_TESTED`。未提交或推送。

[本轮独立复评](../../../docs/framework/evidence/shared-ui-r19-recheck-20261018-01a14f00/independent-review.json)：八维 98 / 97 / 97 / 98 / 96 / 96 / 96 / 96，等权 96.75。工程复跑入口初审 94 的缺口与修正均保留；实际入口和本机冻结范围见[复跑说明](../../../docs/framework/evidence/shared-ui-r19-recheck-20261018-01a14f00/REPRODUCE.md)。
