# R24.3 · JSX / Vue SFC 复用内置运行时（实现候选）

日期：2026-10-11；仓库：shopable-ai/opendesk-browser。

**状态：仅实现候选并补充 CI 测试，当前尚未取得本候选真实 Vite/Chrome PASS；不宣称完全完成或已达到专家 95 分。** 不覆盖 R24.1 的旧失败证据、R24.2 Direct 的 Chrome PASS。

## 根因和实施边界

R24.1 原 JSX/Vue SFC Vite 输出 React 961871 B / Vue 144502 B，重复打包运行时；旧 Page 源码模块上限 256 KiB、最终执行 JS 上限 100000 B。扩展已有 React 19.2.0 / Vue 3.5.22 的独立 SHA-256 校验资源，不应扩大预算。

- React：Vite 用经典 JSX → `React.createElement` 转换；Hooks 与 createRoot 来自已有 `globalThis.OpenDeskPageReact`；项目 `opendesk.framework: "react"`。不再把 React/ReactDOM 嵌进当前例子编译产物。
- Vue：Vite 把 `vue` 模块导向当前示例专用的 `src/vue-runtime-adapter.js`；使用已固定的 `globalThis.OpenDeskPageVue` 的 `createApp/h/ref/onMounted`。受限适配只覆盖**当前测试模板**需要的四个编译 helper，并令未知 helper 在 Vite 阶段编译失败。它**不代表支持任意官方 SFC 指令、slot、Transition/Teleport 等**；未来必须由受信扩展统一补齐完整运行时编译辅助 API，重建固定字节并复核 SHA/许可证。
- 继续复用原 `@opendesk/ui`、R23 Resolver、Page USER_SCRIPT/权限/Stop，**没有新建执行器，没有 CDN、MAIN/eval，未调高限制**。
- **尚未实现** `opendesk browser dev .` 原生自动编译 JSX/SFC。Node CLI 不会运行任意项目 npm scripts。此候选使用用户明确启动的 Vite watch 生成编译 JS，之后 R23 监听自动准备；保存仍不会自动执行网页。

## 本机实际使用顺序（候选）

Node ≥22.12；已正确安装并配对 OpenDesk Native Host / 扩展。**第一次**在仓库根目录安装现有编译器依赖 `npm ci --ignore-scripts --no-audit --no-fund`。

终端 A，在下面两个项目中二选一，安装已锁定的依赖，并保持 Vite 监视运行：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser/examples/programs/page-ui-react
npm ci --ignore-scripts --no-audit --no-fund
npm run build:framework -- --watch

# Vue 则切换目录：
# cd /Users/shopme/Documents/workspace/opendesk-browser/examples/programs/page-ui-vue
# npm ci --ignore-scripts --no-audit --no-fund
# npm run build:framework -- --watch
```

**先确认首次 Vite 构建成功且 `src/compiled/framework.js` 已出现**，再用终端 B 同目录执行：

```sh
opendesk browser dev .
```

终端 C（一次即可）在仓库根目录：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

Chrome 打开 `http://127.0.0.1:43111/demo-form.html` → Side Panel「开发 → 本地项目」选择已接入的项目 → 核实用户脚本和网站授权 → **点击运行**。保存 JSX/SFC 由 Vite watch 更新 `src/compiled/framework.js`，R23 自动准备最新产物；再次显式点击运行才能应用。如果在 Vite 首轮完成前启动 CLI，该目录可能被识别为纯 Workspace，须重新连接。

在仓库根目录使用以下命令进一步验证 OpenDesk 构建，Vue 将路径改为 `page-ui-vue`：

```sh
node scripts/validate-program-project.mjs examples/programs/page-ui-react
node scripts/build-program-project.mjs examples/programs/page-ui-react --mode production
```

最终 `program.js` 构建只是 BUILT_UNVERIFIED，不等于真实 Chrome 可运行或安装成功。想完全避免 npm/Vite，请改用已验证的 `page-ui-react-direct` 或 `page-ui-vue-direct`。

## 实施与验证状态

| 项目 | 当前状态 |
| --- | --- |
| React JSX 轻量编译方案 | 已写入候选代码 |
| Vue 当前演示用 SFC 轻量编译方案 | 已写入候选代码；非通用 SFC |
| 两组真实 Vite → OpenDesk 容量/哈希校验 | 已新增 `tests/integration/page-framework-shared-runtime-r243.test.mjs` 与 CI，等待结果 |
| Vite watch → R23 自动准备的本机完整链路 | NOT_TESTED |
| 真实 Chrome Hooks/Vue reactivity、DOM 修改、Stop/导航/CSP | NOT_TESTED |
| `opendesk browser dev .` 单命令自动编译 JSX/Vue SFC | NOT_IMPLEMENTED |
| 任意 Vue SFC 官方模板能力 | NOT_IMPLEMENTED |
| 安装/发布/独立 F3/ZIP | NOT_TESTED |

**正式关闭条件**：同一候选源码、构建包 SHA 与真实 Mac CFT 下，实测两组均在原 100000 B 预算内，浏览器 USER_SCRIPT 挂载/交互/撤销和 20 次 Stop/Run、SPA/BFCache、权限和资源身份、编译错误映射、保存后执行最新版本完整 PASS。当前没有这些证据，不得自评 ≥95。

为实现单命令的最终产品体验，下一轮应在 **R23 受控 Resolver** 内实现针对 JSX/.vue 的冻结输入/已固定编译器语法转换（不运行任意用户 Vite config/npm scripts）、SFC 官方 Helper 的完整固定运行时支持、Go→Sidebar 实时准备状态同步、缓存哈希与错误定位，保留现有执行器及授权。