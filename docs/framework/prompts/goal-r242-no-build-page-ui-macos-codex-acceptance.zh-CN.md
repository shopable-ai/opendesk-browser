# GOAL：OpenDesk Browser R24.2 —— React/Vue 免手工编译 Page UI 本地 Codex Mac Chrome 测试、修复与验收

默认中文。目标仓库 https://github.com/shopable-ai/opendesk-browser 。直接检查真实 Mac 本地源码，执行必要测试、修复、记录证据并在安全条件下提交，不只输出建议。不创建分支、Worktree 或 PR；仅当前 `main`。禁止强推、破坏性 reset/clean 和覆盖并行 Agent 的未提交源码、CFT profile、dist、构建产物或原始 receipt。不擅自 push 远端 main。

## 1. 安全开工

```sh
pwd
git status --short --branch
git rev-parse HEAD
git fetch origin main
git rev-parse origin/main
git log -8 --oneline
```

首先阅读 `AGENTS.md`、`docs/framework/testing-guide.md`、`docs/api/page-userscript.zh-CN.md`、`docs/api/page-ui-frameworks.zh-CN.md`、`docs/framework/workstreams/page-ui-no-build-r242-20261011.md`、`examples/import-ready/README.zh-CN.md` 以及已有工作流证据。检查其他工作对 `main` 的未提交更改和 43111/CFT/profile 的独占使用；仅安全时快进，不覆盖任何人。核对已有成功 CI 回执的源码身份与本候选输入依赖，未变不无意义重跑。

## 2. 审查零手工编译实现

原生运行时与项目必须全部复用：

- `src/libs/page-frameworks/{contract.js,loader.js,react-19.2.0.js,vue-3.5.22.js}`；
- `src/scripting/user-scripts/{execution-source.js,preview.js,installed-programs.js,page-program-rules.js,page-ui.js,managed-ui-lifecycle.js}`；
- `native-agent/local-dev/resolver.mjs`、`scripts/build-program-project.mjs`；
- `examples/programs/page-ui-react-direct/{package.json,src/main.js,src/enhancement.js}`；
- `examples/programs/page-ui-vue-direct/{package.json,src/main.js,src/enhancement.js}`；
- `examples/import-ready/*opendesk-draft.json`，以及已有 Page UI / Program tests。

用户写普通 `.js`，点击 Run；React 使用 `createElement/Hooks/createRoot`、Vue 使用 `createApp/h/ref`。用户无需 npm/Vite、JSX/TSX 或 SFC。框架由**扩展**固定 SHA-256 资源加载，禁止 CDN、eval、任意 URL、MAIN 世界或新执行器。已安装自动触发和预览授权继续独立；用户保存文件不自动操作网站。

## 3. Node 定向检查（完成真实故障修复）

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/page-ui-no-build-r242.test.mjs tests/environment/page-ui-import-drafts-r242.test.mjs tests/environment/page-url-scope-r241.test.mjs tests/environment/page-installed-programs.test.mjs tests/environment/local-dev-managed-ui.test.mjs
npm run check
npm run build:dev
npm run build
```

检查扩展资源清单、React/Vue 许可证、固定字节 SHA、CSP、包闭包、页面产物源码体积、单独用户脚本能力和依赖锁；所有失败先复现和归因，不能悄悄放宽脚本与 Native 请求预算。发现失败时只修确认的差异，禁止新增框架加载器、第二套 URL 匹配器或运行器。

## 4. 手动导入两份可运行草稿

在不抢占他人 43111 端口时启动：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

Chrome 打开 `http://127.0.0.1:43111/demo-form.html`、真实插件 Sidebar，允许当前 HTTP 站点及用户脚本。

- 发现 → 导入 → 打开完整任务目录 → 文件选择：`examples/import-ready/page-ui-react-direct.opendesk-draft.json`；返回开发/直接编辑，确认来源只读和 Page 类型，点击「在当前网页试运行」，用真实鼠标点击高亮/撤销，最后「停止受管 UI」。
- 同法导入 `examples/import-ready/page-ui-vue-direct.opendesk-draft.json`，核对 Vue 组件及 Stop。
- 本地项目方式：Codex/Native Provider 授权 `examples/programs/page-ui-react-direct` 和 `examples/programs/page-ui-vue-direct` 两个目录；Sidebar 开发 → 本地项目 → 刷新 → 选择 → 运行本地项目。仅保存 `src/main.js` 不会自动运行；再次运行必须使用最新 sourceHash，不能继续使用旧快照。
- 检查 `#sample-text`、`[data-opendesk-example-marker]`、`[data-opendesk-ui-owner]`；不更改 `#name`、`#results` 等原网页表单或业务数据。

## 5. 原生 Mac Chrome for Testing 专项验收

先审查 `.github/workflows/page-ui-no-build-r242-native.yml`、`tests/framework/local-dev-native-acceptance.mjs`、`tests/framework/page-frameworks-r242-native.mjs`。已有 GitHub Actions run `38132174469` 在候选 `5dbd89d` 为专项 PASS，验证 React/Vue 各 21 次真实指针点击与受管 Stop；仅在相关输入发生变化时按受影响范围重验。

若当前本地有独立 CFT 资源，运行已存在的真实驱动，使用新的隔离目录和 Native instance（不要抢占其他 Agent）：

```sh
CHROME_FOR_TESTING_BIN=/actual/path/to/chrome \
OPENDESK_DEV_SLICE=page-frameworks \
OPENDESK_DEV_EVIDENCE=.runtime/tests/r242-codex-local \
OPENDESK_NATIVE_INSTANCE=r242-codex-local \
OPENDESK_DEV_CFT_LAUNCHER="$PWD/tests/framework/cft-isolated-launcher.py" \
node tests/framework/local-dev-native-acceptance.mjs
```

确保已实际构建对应 `dist/production` 并核对可追溯 SHA；不要因为本地配置未就绪而把环境 BLOCKED 当产品 PASS。分别检查 React/Vue 真实 USER_SCRIPT、documentId/sourceHash、按钮点击效果、原生 Stop 回执、20 次开关/点击、网页原始表单不变。新增需求的 **20 次独立 Run/Stop**、SPA 排除后主动卸载、BFCache、网站撤权、CSP、暗色、200% 缩放和窄屏须独立取证；旧用例没有测试的标记 NOT_TESTED。

## 6. 交付与评分

将本次专属候选 SHA、命令、运行环境、Node TAP 原始结果、扩展 packageHash、真实 Chrome 截图/DOM 与 previewId/sourceHash/documentId、Stop receipt、已确认问题及仍未测事项记录在新的 `docs/framework/workstreams/` 专属记录与 `.runtime/tests/`；不覆盖之前的证据。只在安全且允许时 `git add` 本任务文件并本地提交，不推送。最后明确列出**已复用、已修改、已测试、未完成**，URL、安全、React、Vue、DOM 可逆、SPA 生命周期、文档各维度独立评分，未真正验收则 NOT_TESTED，不因目标 ≥95 而假报。

## 7. 2026-10-11 最新候选校验附注（R24.2）

本段供新 Codex 开始执行时核对，不能直接把历史 CI 的候选 SHA 当成当前工作区身份。

- 完整正向 Native Chrome 历史：`5dbd89db3e32d78f700e7d3a0979acc875d18a0f` 对应 [R24.2 run 38132174469](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132174469)，当时框架 React / Vue、每种 21 次原生鼠标点击及一次受管 Stop 均为 PASS。该结果**不等于 20 次独立 Run/Stop**。
- 后续 `2a1677fc9df98284580aab4eb9230816bb455128` 的 [R24.2 run 38139700073](https://github.com/shopable-ai/opendesk-browser/actions/runs/38139700073) 中，Node 框架组件测试 **4 PASS / 0 FAIL**，但 `npm run build` 失败：`sw.js 349336 > 327680`（原有生产 Service Worker 预算）；没有到达真实 Chrome 阶段。这不是 React/Vue 组件真实 Chrome 失败证据，也不能因为历史 PASS 就把新候选填 PASS。另有同期独立包校验指出 optional libs 的动态构造器边界，需核对当前主线修复进展。
- 优先审阅当前 HEAD 与包体积证据，确认这些错误是否由并行官方工具、依赖库或其他工作流引入。**绝对禁止直接调大 SW 固定预算、删除安全扫描、覆盖别人改动来制造绿灯。** 若非 R24.2 所有权范围，请在各自 workstream 标记阻塞、定位负责人，避免抢占其他 Agent 正在维护的 SW/依赖框架。
- 原生新测试的 **20 次独立 Run/Stop** 需要真正取得 20 组不同的 `previewId`、最终 `preview-retired`/清理回执、每次 DOM 归零与框架重新挂载。原有同文档命名 USER_SCRIPT world 上限为 6，所以每次需要在用户明确认可的**新 document** 重新导航/刷新，并保存 documentId 的变化；不要通过跳过隔离探针、重用旧 previewId 或伪造回执绕过预算。20 次点击/撤销不计作 20 次 Run/Stop。
- 人工网页检查代码（仅用于只读观察，不替代真实点击/Stop）：在 `demo-form.html` 打开 DevTools Console：

```js
const hosts = [...document.querySelectorAll('[data-opendesk-ui-owner]')];
({
  reactMounted: !!document.querySelector('[data-od-id="sample.page-ui-react-direct"]')?.shadowRoot?.querySelector('button'),
  vueMounted: !!document.querySelector('[data-od-id="sample.page-ui-vue-direct"]')?.shadowRoot?.querySelector('button'),
  hostCount: hosts.length,
  markerCount: document.querySelectorAll('[data-opendesk-example-marker]').length,
  sampleOutline: document.querySelector('#sample-text')?.style.getPropertyValue('outline'),
  nameValue: document.querySelector('#name')?.value
});
```

- 对照真正可复制的组件测试 `tests/environment/page-ui-no-build-r242.test.mjs`、导入一致性测试 `tests/environment/page-ui-import-drafts-r242.test.mjs`、真实 Chrome 驱动 `tests/framework/page-frameworks-r242-native.mjs`。两个可在原 Sidebar 手动导入的 JSON 已放在 `examples/import-ready/page-ui-{react,vue}-direct.opendesk-draft.json`；无需手动套用源码 patch。
- 若要验收 JSX/TSX 和 `.vue` SFC 的「用户无手工编译」，首先核实当前是否已有自动转换编译服务；不能把本轮普通 JS `createElement()/h()` 演示等同于直接运行 JSX/SFC。
