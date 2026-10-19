# AdBlock · 正式 React 产品（R2.11）

> **唯一正式 UI：** `src/App.jsx`（React JSX）及 `src/main.jsx`、`src/model.js`、`src/layout.css`。改 UI 只改这里。**不要编辑生成的 JS/CSS，也不要编辑历史 HTML 原型。**

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
open artifacts/previews/adblock/success-light-360.html
```

预览输出文件名以构建脚本实际结果为准，也可以传 `--out artifacts/previews/adblock/review.html` 后直接打开它。预览加载的是 `dist/tool.js` 与 `dist/tool.css` 对应的**正式 React 组件**，另有预览专用 `scripts/preview/adblock-mock.js` 只模拟 SDK 回执；它不能证明网络广告真正被 Chrome DNR 阻断。

建议同时使用 320/360/400/440px、浅色与深色、键盘切换；真实 Chrome 预览测试入口为：

```bash
node scripts/tests/adblock-preview-chrome.mjs artifacts/preview-chrome
```

## 真实产品与安全边界

安装包的 `adblock.control` 仅经原有可信宿主授权运行。Chrome DNR 所有权、权限、安装身份、状态读回、取消、停用、卸载、失败回退均由 `trusted/` 和宿主原流程负责；沙箱 JSX 不调用 `chrome.declarativeNetRequest`，不承担授予权限的职责。AdBlock 只清理自己的规则 ID 741000–741199，不能覆盖 Stay Focus 的规则或解除其它应用的限制。

固定离线名单当前 67 个域名，不宣传未经实测的请求拦截数。网站例外仅在当前受支持 HTTP(S) 标签页身份核实后可修改；导航期间旧请求结果不可用于新网站。规则更新后的真实效果应通过独立 Chrome 网络请求与 DNR 读回验证。

## CI 与发布状态（以最新执行结果为准）

```bash
node scripts/app-ci.mjs build adblock
node scripts/app-ci.mjs node adblock
node scripts/app-ci.mjs browser adblock
node scripts/app-ci.mjs native adblock
```

后两项要求真实 Chrome/真实 macOS 环境和对应回执；Node/Mock/离线预览通过绝不冒充真实拦截成功。升级保留已有数据和安装身份；同版本不同字节不能静默覆盖正式包。

目前 `tool.config.json` 是 **1.2.1 源码候选**，仓库正式 `adblock.opendesk-tool.json` 仍为 **1.2.0**。这是故意隔离的发布门禁，不应通过同步版本字符串或手工覆盖 JSON 消除差异。只有原有完整候选与真实 Native 验证后，才能用 `scripts/build-sidebar-tool.mjs --promote-from <已验证候选>` 进行显式晋升。无 Mac Chrome 证据时，真实安装、网络拦截与 95 分产品验收状态一律为 `NOT_TESTED`。
