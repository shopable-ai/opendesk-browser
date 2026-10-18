# Shared UI R1.8 · 官方 React Aria JSX 工具 Demo

本轮 Mac Chrome for Testing 155 的 production 候选已通过真实原生 Side Panel 文件导入、安装审核、两轮点击/Tab/Space、ARIA/禁用态、关闭重开和实际 200% 浏览器缩放。唯一正式包 `shared-ui-demo.opendesk-tool.json` 为 1,480 字节，与已安装候选逐字节一致。原始报告与构建身份见 [本轮证据](../../../docs/framework/evidence/shared-ui-r18-mac-20261018/summary.json)。

在包含本轮共享资源的 OpenDesk Browser 中，进入「扩展」→「…」→「导入本地工具包」，选择上述 JSON，审阅后安装并打开「广告拦截演示」。工具只模拟状态，安装不增加 Chrome 权限。

这是独立 Sidebar Tool；只模拟「已关闭 → 已开启 → 已关闭」，不启用 DNR、不修改正式 AdBlock，也不添加任何 Chrome 权限。

## 开发者只写 JSX

`src/App.jsx` 是唯一业务组件，直接从 `react` 和 `@opendesk/ui` 导入 Hooks、Card、CardContent、Switch。启动模板 `src/main.jsx` 内部管理 React Root 和 `pagehide` 清理。工具作者不需要资源加载器、运行时 URL、CDN 或自行管理 React Root。

- **React 19.2.0**：浏览器固定发布的 `libs/page-frameworks/react-19.2.0.js`，经 `src/libs/page-frameworks/contract.js` 校验 SHA256 与文件字节；工具包不携带 React/ReactDOM。
- **Card/CardContent**：基于 shadcn/ui 官方 React Aria Card 源码，局部适配既有 OpenDesk 语义 Tokens。
- **Switch**：基于 shadcn/ui 官方 React Aria Switch 结构，行为使用真实 `react-aria-components@1.22.1`；React Aria 随浏览器固定的 `sidebar-shared-ui.js` 资源发布，**不**进入工具 JSON。
- 上游第三方许可证：`docs/contracts/licenses/shared-ui-third-party-notices.txt`，随浏览器发布至 `licenses/shared-ui-third-party-notices.txt`。

## 真实构建（必须遵守顺序）

先由构建负责人在隔离源码快照中使用自己的 `npm ci` 依赖与现有 WXT 命令完成真实扩展构建。下面在仓库根选用已有 production 产物，只写本工具的 `dist/` 和 `.opendesk-preview/browser/`；不运行第二个 WXT 构建、不覆盖日常 watcher 的 `dist/development`：

```sh
OPENDESK_SHARED_UI_EXTENSION_DIR=artifacts/shared-ui-r18/build-snapshot/dist/production npm run build --prefix examples/sidebar-tools/shared-ui-demo
OPENDESK_SHARED_UI_EXTENSION_DIR=artifacts/shared-ui-r18/build-snapshot/dist/production node --test tests/environment/sidebar-shared-ui-r16.test.mjs tests/environment/sidebar-shared-ui-r17.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --out artifacts/sidebar-tools/shared-ui-demo/candidate.opendesk-tool.json
# 同候选构建、测试与真实 Chrome 验收通过后，才准晋升：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --promote-from artifacts/sidebar-tools/shared-ui-demo/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --check-project
```

**正式安装包只允许一个**：`shared-ui-demo.opendesk-tool.json`。若任一步 FAIL，不创建或晋升正式包。候选包与忽略的构建缓存不是发布交付。首次尝试在 `dist` 产物缺失时运行 R1.6 会 SKIP；只有 R1.7 的强制产物测试通过才算包体编译验证。

`OPENDESK_SHARED_UI_EXTENSION_DIR` 相对当前源码树的仓库根解析，缺省为 `dist/development`，构建和 R17 测试必须选择同一目录。在隔离快照内执行时选 `dist/production`；文件同步由快照负责人完成，并在该树重新执行工具构建，不复制根目录 receipt 冒充快照证据。切换候选或修改源码后重新构建并重跑定向测试。

## 同源预览与实际安装的界限

Vite `closeBundle` 从选定 WXT 输出逐字节暂存固定 React、`sidebar-shared-ui.js`、`ui/design-tokens.css` 和两份许可证到本工具忽略目录 `.opendesk-preview/browser/`。缺失文件、空资源或 React 字节数/SHA 与既有合同不符均构建失败，不回退到其他目录；失败构建不留下旧 receipt。最后写入 `receipt.json`，包含选定扩展目录、manifest、当前工具源码、Vite JS/CSS 与暂存资源的字节数和 SHA256。构建中源码漂移会拒绝暂存，R17 再核对当前源码、应用输出、原 WXT 资源与暂存字节一致。

`preview/index.html` 只加载这些暂存的真实浏览器资源和原 `../dist/tool.js`、`../dist/tool.css`，直接打开该固定 HTML 即可预览；没有另一套业务 JSX、运行时或模拟开关。`OpenDeskTool` 仅提供预览根节点，不提供宿主请求接口或可信权限。独立 HTML 的开关交互不能代表已安装插件通过。

Headless Chrome 源码同源预览校验：

```sh
CHROME_BIN=/path/to/chrome node scripts/tests/shared-ui-r17-preview-chrome.mjs artifacts/sidebar-tools/shared-ui-demo/chrome
```

该脚本覆盖 320/360/400/440 宽度与明暗主题、点击状态回转、键盘输入、React Root 卸载和无 CDN。以上只能记为 `SOURCE_BOUND_CHROME_PREVIEW_PASS`。浏览器扩展真实安装/导入/Side Panel 生命周期必须单独取 Chrome 证据；本地 Mac 未运行则明确标记 `NOT_TESTED`，不能用预览代替。

CI：`.github/workflows/shared-ui-r17.yml` 使用真实 npm 锁文件与 WXT/Vite 产物，production 输出选择通过相同环境变量传入。候选哈希清单应包含 `dist/tool.js`、`dist/tool.css` 和 `.opendesk-preview/browser/` 内上述五份资源及 `receipt.json`；Chrome、候选晋升与原始日志由验收流程绑定同一候选，不能仅凭暂存成功判定通过。只共享跨工具发布的 **文件字节**，同一工具 Sandbox 内使用同一个 React 实例，不把用户 JSX 交给可信 Host 的 React Root。
