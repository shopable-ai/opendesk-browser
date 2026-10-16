# React UI R32.8 · 最小接入核查与目录决策

2026-10-16 | 唯一可写分支：`main` | 范围负责人：R32.8 React UI 核查

## 归属、决定与并行边界

- 本轮唯一写入路径为**本文件**；未修改 Host、Browser SDK、打包器、`package.json`、React/Vue Starter、现有工具、安装包或共享 CSS。
- **不新增 `ui-react/`、`packages/opendesk-ui-react/`、第二个运行时或 UI Kit。** 当前没有两个正式独立工具同时要求共享同一 React 组件 API 的证据；仅为验证而创建公共包属于过度设计。
- 单工具私有组件放在 `examples/sidebar-tools/<tool-id>/src/`，与本工具业务和 Vite 构建入口一起管理。确有多个独立消费者、稳定 API、独立依赖/体积验证以后，才重新评估 `packages/` 下的公共 React 组件源码。
- 网页受管 UI 继续使用 `examples/programs/page-ui-react*` 及既有 `USER_SCRIPT` 生命周期；受信浏览器 Tab 的共享原生视觉原语继续归 `src/ui/`。三者运行世界不同，不互相挪用特权、组件根节点或依赖。

## 现有可直接复用的真实链路

| 能力 | 源码或证据 | 结论 |
| --- | --- | --- |
| React JSX 与组件导入 | `examples/sidebar-tools/react-starter/src/{main,App,ActivityChart}.jsx` | React 19.2.0，Vite 7.3.6 本地编译；Chart 是本项目组件并导入固定第三方 JS 库 |
| Vue 与原生 JS 共存 | `examples/sidebar-tools/vue-starter/`、`scripts/build-sidebar-tool.mjs` | Vue 3.5.22 独立构建；普通工具无需 React |
| 安全工具包 | `scripts/build-sidebar-tool.mjs`、`tests/framework/sidebar-tool-starter-build.mjs` | 使用现有 IIFE JS + 本地 CSS + 统一沙箱打包与大小检查；不新增 CDN/权限/Host |
| 样式共享边界 | `src/ui/design-tokens.css`、`scripts/preview/shared-tool-design.mjs` | Trusted Host tokens **不可直接在沙箱运行时注入**；只有按现有构建标记和校验抽取的公开样式可用于独立工具 |
| 网页原生 React | `docs/api/page-ui-frameworks.zh-CN.md` | 与独立 Sidebar iframe 工具不同；浏览器直接输入 JSX 仅限 Developer Edition，不能据此宣称 TSX 已支持 |

### 开发者最短使用路径

1. 在自己的独立工具目录内固定 React/ReactDOM 与所需组件依赖；默认沿用现有 React Starter 的 JSX + Vite IIFE 构建方式。不要把 React 加入仓库根依赖或强加给其他工具。
2. 同一工具内按需 `import` 本地 React 组件或经过许可证/版本/体积审查的第三方组件，构建生成 `dist/tool.js` 与 `dist/tool.css`，不在沙箱运行时从 CDN 加载代码。
3. 保持原 `tool.config.json`、沙箱消息/能力和显式安装授权；React `useEffect` 中撤销监听/请求，网页受管 UI 的 Stop 必须正确卸载 React root。
4. 对需要官方颜色/按钮语义的独立工具，先验证 `compileSharedToolCss` 的**构建时**公开样式抽取合同；不得直接导入含 Host 专属选择器的 `design-system.css`。React Starter 目前仍使用工具局部配色，**不能视为已完成 Tokens 视觉一致性验收**。
5. 需要 Tree、Combobox 或 Radix/React Aria 等成熟无障碍控件时，在具体消费工具中选择最小导入及其必需 CSS；确认体积、键盘、焦点、沙箱 Portal 和销毁行为后再考虑公共封装。

### 可重跑验证

```bash
node --test tests/environment/sidebar-react-cdn-bundle.test.mjs
(cd examples/sidebar-tools/react-starter && npm ci --ignore-scripts --no-audit --no-fund && npm run build)
(cd examples/sidebar-tools/vue-starter && npm ci --ignore-scripts --no-audit --no-fund && npm run build)
node tests/framework/sidebar-tool-starter-build.mjs
```

上述命令只证明 Node/构建和工具包来源；不会自动安装工具或完成真实 Mac Chrome 验收。

## 实证与独立审查（本轮只读，切勿外推到不同 HEAD）

- `2d8fe8ffeb492cc420d48b0c1d0bd34d24e06803`：<https://github.com/shopable-ai/opendesk-browser/actions/runs/38878878661> `sidebar-tool-contract-and-package` PASS。React `tool.js` 199,176 字符、CSS 3,525 字符、完整工具 JSON 207,748 字节，React/Vue receipt 哈希与 220,000 字符 / 320,000 字节预算 PASS；同时执行生产/开发构建。该候选不是最新主线的永久豁免。
- `905b63cb5622cd0382f41625f7ed5648e0f43a3f`：<https://github.com/shopable-ai/opendesk-browser/actions/runs/38878700939> Bookmark Manager **React 离线预览**真实 Chromium 交互 PASS；**不是 React Starter 安装后的原生验收**，且正式 Bookmark Manager 工具未因本轮迁移 React。
- GitHub CI 为历史候选提供构建证据；本轮没有访问用户 Mac 路径或已安装扩展，React Starter 的最新安装/切换/完整生命周期均记 `NOT_TESTED`，不伪报 95+。

| 独立维度 | 本轮状态 / 证据 | 评估（满分100） |
| --- | --- | ---: |
| React JSX 开发入口 | `react-starter` 源码 + 绑定候选 Vite CI PASS；不是 TSX 合同 | 96 |
| 源码目录与职责 | 私有组件原位；不新增无消费者共享目录 | 98 |
| React/Vue/HTML 多框架 | 独立入口与工具统一打包 CI PASS | 97 |
| 最小修改与并行隔离 | 只提交本工作记录，不写业务/宿主/依赖 | 99 |
| UI 组件可复用性 | 已证实工具内 React 组件与第三方 JS；跨工具公共 UI 需求尚未成立 | 91 |
| TypeScript / TSX 组件 API | 当前 Starter 为 JSX；无新 TSX 构建及类型检查证据 | NOT_TESTED |
| Design Tokens 一致性 | 存在受控公开样式提取器；React Starter 局部主题未对齐验证 | 87 |
| 构建与依赖安全 | 固定版本、本地 IIFE、receipt/包校验 CI PASS | 97 |
| 性能与工具包预算 | 199,176 / 220,000 字符，剩余空间有限；大型 UI Kit 风险 | 90 |
| SDK/Host/Sandbox 来源安全 | 打包器和无 CDN 静态测试 PASS；最新原生路径未验 | 95（源码与 CI 范围） |
| 维护与按需扩展 | 只在有真实第二消费者时抽取；复用现成脚本 | 96 |
| 已安装工具真实 Chromium | 历史 React 预览有独立证据；本工具最新安装未执行 | NOT_TESTED |

**反方审计结论：** 增加一个空公共包、复制设计 Tokens、强制迁移 Vue/HTML 工具或仅为获得 95 分而扩大包上限，都会增加成本或制造误导。R32.8 的「React 可选开发能力」已有源码/历史 CI 证据；「TSX、跨工具公共 React UI Kit、React Starter 真实原生安装及 Tokens 视觉统一」尚未完成，不得宣称 12 项均 ≥95。未来只有具体工具消费者与可复现缺口，才需要新增公共组件或修复对应构建集成。
