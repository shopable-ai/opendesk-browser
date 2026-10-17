# Shared UI R1.7 · 官方 React Aria JSX 工具 Demo

这是独立 Sidebar Tool；只模拟「已关闭 → 已开启 → 已关闭」，不启用 DNR、不修改正式 AdBlock，也不添加任何 Chrome 权限。

## 开发者只写 JSX

`src/App.jsx` 是唯一业务组件，直接从 `react` 和 `@opendesk/ui` 导入 Hooks、Card、CardContent、Switch。启动模板 `src/main.jsx` 内部管理 React Root 和 `pagehide` 清理。工具作者不需要资源加载器、运行时 URL、CDN 或自行管理 React Root。

- **React 19.2.0**：浏览器固定发布的 `libs/page-frameworks/react-19.2.0.js`，经 `src/libs/page-frameworks/contract.js` 校验 SHA256 与文件字节；工具包不携带 React/ReactDOM。
- **Card/CardContent**：基于 shadcn/ui 官方 React Aria Card 源码，局部适配既有 OpenDesk 语义 Tokens。
- **Switch**：基于 shadcn/ui 官方 React Aria Switch 结构，行为使用真实 `react-aria-components@1.22.1`；React Aria 随浏览器固定的 `sidebar-shared-ui.js` 资源发布，**不**进入工具 JSON。
- 上游第三方许可证：`docs/contracts/licenses/shared-ui-third-party-notices.txt`，随浏览器发布至 `licenses/shared-ui-third-party-notices.txt`。

## 真实构建（必须遵守顺序）

在仓库根、没有其他会话占用同一开发构建目录时：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:dev
npm run build --prefix examples/sidebar-tools/shared-ui-demo
node --test tests/environment/sidebar-shared-ui-r16.test.mjs tests/environment/sidebar-shared-ui-r17.test.mjs
node scripts/tests/shared-ui-r17-size-baseline.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --out artifacts/sidebar-tools/shared-ui-demo/r17-candidate.opendesk-tool.json
# 构建/测试真实通过后，才准执行下面两条命令：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --promote-from artifacts/sidebar-tools/shared-ui-demo/r17-candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/shared-ui-demo --check-project
```

**正式安装包只允许一个**：`shared-ui-demo.opendesk-tool.json`。若任一步 FAIL，不创建或晋升正式包。候选包与忽略的构建缓存不是发布交付。首次尝试在 `dist` 产物缺失时运行 R1.6 会 SKIP；只有 R1.7 的强制产物测试通过才算包体编译验证。

## 同源预览与实际安装的界限

`preview/index.html` 直接引用同次编译的 `dist/tool.js`、`dist/tool.css`，并加载浏览器真实 `dist/development/libs/page-frameworks/react-19.2.0.js` 和 `dist/development/sidebar-shared-ui.js`；没有模拟开关或第二套 JSX 组件。**必须先生成两边的 dist 文件**，再从仓库按文件相对路径打开。独立 HTML 的开关交互不能代表已安装插件通过。

Headless Chrome 源码同源预览校验：

```sh
CHROME_BIN=/path/to/chrome node scripts/tests/shared-ui-r17-preview-chrome.mjs artifacts/sidebar-tools/shared-ui-demo/chrome
```

该脚本覆盖 320/360/400/440 宽度与明暗主题、点击状态回转、键盘输入、React Root 卸载和无 CDN。以上只能记为 `SOURCE_BOUND_CHROME_PREVIEW_PASS`。浏览器扩展真实安装/导入/Side Panel 生命周期必须单独取 Chrome 证据；本地 Mac 未运行则明确标记 `NOT_TESTED`，不能用预览代替。

CI：`.github/workflows/shared-ui-r17.yml` 从真实 npm 锁文件安装依赖、WXT 和 Vite 构建、构建期强制校验、正式 JSON 候选晋升与同源 Chrome 交互，并记录字节数；运行结果以同候选日志和实际产物为准。只共享跨工具发布的 **文件字节**，同一工具 Sandbox 内使用同一个 React 实例，不把用户 JSX 交给可信 Host 的 React Root。
