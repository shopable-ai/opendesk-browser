---
name: opendesk-script-authoring
description: Author and debug Controller automation, Page USER_SCRIPT 网页增强, React JSX, Vue SFC and local projects in OpenDesk Browser 开发. Task belongs to 我的; installed Page is 扩展 网页增强 via independent Program Authority, not Sidebar Tool.
---

# OpenDesk Browser ·「开发」脚本编写

## 触发与职责

用户在 **Side Panel → 开发** 编写、修改、解释或试运行 JS、React、Vue，或编写「我的」中的 Controller 自动化任务、Page 网页增强脚本时使用。现行五 Tab 见 [R4 产品规格](../../../docs/product/sidebar-ui-spec.zh-CN.md)；Page 正式安装后以「扩展 → 网页增强」管理。**先判断代码运行在哪里，再决定源码格式和运行入口**。该 Skill 只指导作者，不是新编译器、Runner、Host、SDK、依赖管理器或权限系统；始终复用现有 Controller Worker / ChromePage `page` / RunHost、Page `USER_SCRIPT`、官方 React/Vue Runtime、受管 UI 和本地 Native/MCP 链。

与其他 Skill 的边界：

- [`opendesk-program-publish`](../opendesk-program-publish/SKILL.md)：冻结、验证、保存为 Task/Page、安装、升级、发布；试运行不等于安装。
- [`opendesk-sidebar-tool-dev`](../opendesk-sidebar-tool-dev/SKILL.md)：用户/AI 在 **「扩展」中安装的「应用」（Sidebar Tool）**，`opendesk.sidebar-tool.v1`、iframe 沙箱及 `OpenDeskTool` 桥。
- [`opendesk-trusted-sidebar-feature`](../opendesk-trusted-sidebar-feature/SKILL.md)：随扩展静态构建、经过审计的 **第一方可信 Side Panel 功能**；不能把动态工具源码改作可信 UI。

## 先读当前仓库，而不是复述过时教程

1. `AGENTS.md`、`docs/framework/testing-guide.md`、最新 `main`、当前文件/并行资源与原始证据；只处理本任务文件，不覆盖其他 Agent 的改动。
2. `docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`、`docs/api/controller.zh-CN.md`、`docs/api/page-userscript.zh-CN.md`、`docs/api/page-ui-frameworks.zh-CN.md`、`docs/api/sidebar-local-projects.zh-CN.md`。
3. 仅在涉及依赖、版本或特殊入口时查 `docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md`、`docs/api/dependencies-and-errors.zh-CN.md`、`docs/architecture/browser-framework/browser-compiler-editions-r245.zh-CN.md` 和真实 `src/ui/script-editor.js`、`src/ui/page-component-preparer.js`。
4. 历史 CI 的 PASS 只针对其绑定的源码/扩展包。文档和源码相冲突时以实际代码和当前测试为准，说明差异，不编造可用能力。

## 作者决策表：JS / React / Vue 不等于一个执行世界

| 用户要做什么 | 源码格式与默认入口 | 从哪儿运行 | 明确不能做的事 |
| --- | --- | --- | --- |
| 网页自动化、Locator、点击/读取、Playwright `page` | **Controller JS**：`async function main()`，直接用受控 `page` | 开发 → 直接编辑 → 运行草稿 | 不在 Worker 直接写 `document.querySelector`，不自造第二套 CDP/Background |
| 当前网页 DOM 读取/临时增强 | **Page JS**：`async function main()`，使用 `document` | 开发 → 网页 JavaScript 试运行 | 无 Controller `page`、`params`、`axiosx`，不获取扩展特权 |
| 当前网页上的 React 按钮/悬浮界面 | 单文件 **React JSX**，`export default function App()` | **Developer Edition** → React JSX → Run/Stop | Standard 浏览器内无 JSX 编译器；不得在网页 MAIN 动态拉 React |
| 当前网页上的 Vue 模板界面 | 单文件 **Vue SFC**：`<script setup>` + `<template>` | **Developer Edition** → Vue SFC → Run/Stop | Standard 浏览器内无 SFC 编译器；不能把 `.vue` 当普通 JS |
| Standard 使用 React/Vue 或多个源文件 | React `createElement` / Vue `h` 的 Direct JS，或经 Native/Node 处理的 JSX/SFC 项目 | 开发 → 本地项目 → 授权目录 → 明确 Run | 本地项目不是手工草稿；保存仅准备，不自动运行 |
| 扩展 → 安装侧栏「应用」 | HTML/CSS/JS / 预构建 React/Vue Sidebar Tool | 交给 `opendesk-sidebar-tool-dev` | 不把 Page UI 转成 Sidebar Tool，也不能共享网站 DOM |
| 正式安装/升级/发布 Task 或 Page | 既有 Task/Page Candidate 与 Authority | 交给 `opendesk-program-publish`；Task 在「我的」，Page 在「扩展」 | Run、Preview、Candidate 均不等于 Installed/Published |

### 可直接粘贴的最小示例

Controller，受控 Worker 语义（用现代 `page`，不用原始页面控制台语法）：

```javascript
async function main() {
  return { title: await page.title(), url: await page.url() };
}
```

Page JavaScript，在已授权的目标文档里运行：

```javascript
async function main() {
  return {title: document.title, heading: document.querySelector('h1')?.textContent ?? ''};
}
```

Developer 的 React JSX 单组件：

```jsx
import {useState} from 'react';
export default function App() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(n => n + 1)}>已点击 {count} 次</button>;
}
```

Developer 的 Vue SFC 单组件：

```vue
<script setup>
import {ref} from 'vue';
const count = ref(0);
</script>
<template><button type="button" @click="count++">已点击 {{ count }} 次</button></template>
<style scoped>button {cursor:pointer}</style>
```

**多文件 ESM Controller/Page** 推荐 `export default async function main()`；**组件**则默认导出 React 函数/Vue 组件，不能机械改成 `main()`。Side Panel 单文件经典 JS 不应强加 `export default`。例子以 `examples/programs/single-file/`、`local-controller/`、`local-page-ui/`、`page-ui-react/`、`page-ui-vue/`、`page-ui-react-direct/`、`page-ui-vue-direct/` 的现有配置与源码为准。

## 运行时、依赖和隔离

- Controller `page/params/axiosx` 是受控 Worker **词法能力**，不是网站 `window.page`；Page `USER_SCRIPT` 可用 `document`，不能拿到 Controller 专属能力。`_`、`dayjs`、`OpenDeskLibs` 按各执行世界的预装合同判断，不能假设工具 iframe、网站 MAIN、SW 全有这些全局。
- React/Vue 网页组件用既有受管容器、官方固定 Runtime、`root.unmount()` / `app.unmount()` 与 Stop。不要自己再创建框架 Host，不能把 Shadow DOM 当作权限沙箱。
- 第三方依赖优先复用现有固定库与标准 `import`。Developer 浏览器内 ESM/本地项目的精确版本、锁定来源、SHA 和世界限制要按当前 `src/libs` / Compiler / Dependency Manager 验证；不宣传任意 npm 裸名、`latest`、远程 CDN 或动态导入均可直接运行。
- 用户主动 Run 不要求逐库人工核对 SHA；自动准备仍必须保留真实 Chrome 权限、固定版本、来源和内容完整性。缺失依赖/授权时报告真实阻塞，不使用 `eval`、动态 `<script>`、伪造 Host 回执或旧成功代码兜底。
- 本地开发只连接已授权目录，项目已锁 npm 先在项目内合法安装；不要重复搭建 Node Runner 或借执行脚本获得任意磁盘读取。`opendesk browser dev .` 保存后准备，**只在用户明确 Run 时执行**。
- 不跨站扩大 `pageRules`；不猜测当前 `tabId/documentId/origin`、不自动获取可选 Chrome 权限、不以发布/安装替代手势。停止不会回滚已经产生的网页/网络副作用。

## 标准调试闭环

1. 确认当前版本 Standard/Developer、直接编辑/本地项目、运行世界、当前目标网站及真实 Chrome 用户脚本/站点授权；UI 缺少模式时不能虚构按钮。
2. 读用户原代码或实际示例，做最小修改。先校验语法与真实依赖，再用对应入口明确 Run；编辑或保存本身不得自动执行。
3. Controller 核对 `runId/resultId/revision.sourceHash/retirementState`；`PENDING` 只算入场。Page 核对 `previewId/sourceHash/documentId`、真实 DOM/交互和原 Stop 回执。不能把两者结果混用。
4. 异常优先给**准确源码位置、环境/权限/依赖错误和最小修复**；修改后用新的有意运行确认结果。回执丢失、断线、导航、撤权、受管 UI 清理未知时查询原身份，不盲目重放副作用。
5. 用户要求继续安装/保存任务时，说明冻结/权限的独立验证步骤后衔接发布 Skill，不自动批准或安装。

## 验收与交付门槛

优先 `examples/tasks/demo-form.html`。使用前检查端口/Chrome Profile 的既有占用；空闲时从仓库根启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`。

最低用户场景：Controller 的 `page.title()` 真值与持久回执；Page 的 DOM 真值；Developer JSX 和 Vue SFC 真按钮交互/Stop；Standard React/Vue Direct 项目运行与清理；语法错误、依赖缺锁/错版本、撤权/导航的安全拒绝；从开发转入安装与 Sidebar Tool 时边界仍成立。按相关差异优先定向：

```sh
node --test tests/environment/script-editor.test.mjs tests/environment/runtime-globals-zero-arg.test.mjs tests/environment/page-jsx-component-r243.test.mjs tests/environment/page-vue-sfc-compiler-r243.test.mjs tests/environment/page-direct-component-r243.test.mjs
```

必要时追加 `npm run check`、Standard/Developer 构建以及 `tests/framework/page-browser-worker-r243-cft.mjs` 与 `page-browser-ui-r243-cycles.mjs` 的真实 Chrome 测试；不能把测试驱动文件存在当成已运行。

**95+ 是目标，不是自动评分**。评估：正确入口/用户价值 20、世界/权限安全 20、架构复用 15、JS/React/Vue 真实交互 15、Run/Stop 与失败恢复 10、依赖与来源 10、身份绑定的实测证据 10。没有真实 Mac Chrome、最终扩展包或全链权限证据时，相应条目标 `NOT_TESTED` / `BLOCKED`，不能因创建 Skill 或 Node mock PASS 就宣称产品已达 95 分。报告实际修改文件、受影响测试、PASS/FAIL/NOT_TESTED 和残余风险。
