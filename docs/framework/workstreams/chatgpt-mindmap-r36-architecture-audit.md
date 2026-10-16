# ChatGPT Mind Map R3.6 · 独立 Program 架构、构建与原生证据审计

> 2026-10-16 · SOURCE FIRST · 审计主体为 `shopable-ai/opendesk-browser` 的 `main`。状态必须按对应 Git SHA/Actions Run 核验；此文不等于原生安装验收。

## 1. 架构界限与正式归属

- **独立业务项目根目录**：`examples/programs/chatgpt-mindmap/`；Program ID `opendesk.chatgpt-mindmap`，版本 `0.2.0`，`runtimeKind: page-userscript`，`USER_SCRIPT` / `document_idle` / `https://chatgpt.com/*`。
- **浏览器宿主根源码**：`src/`，仅提供通用 SDK、编译/候选审核、授权、用户脚本注册及生命周期。它不等于 Program 内部的 `examples/programs/chatgpt-mindmap/src/`。
- **本轮直接代码修复**：`examples/programs/chatgpt-mindmap/assets/ui.css`、`src/view.js`、`src/xmind-adapter.js`（此处 `src/` 均指 Program 相对目录），以及两套 Chromium 探针和环境测试。没有修改仓库根目录 `src/`。
- 本项目不得把 ChatGPT selectors、答案结构、XMind Workbook/Snowbrush 适配、UI、转换代码植入根 `src/`；发现 SDK 通用能力不足时单独审计，不可发明 Mind Map 专用宿主接口。

## 2. Program 源码树（所有目录均从仓库根目录起算）

| 目录或路径 | 归属 |
| --- | --- |
| `examples/programs/chatgpt-mindmap/package.json` | Program 清单、Page 匹配规则及 CSS 资产声明 |
| `examples/programs/chatgpt-mindmap/src/main.js` | Program 入口、SDK 生命周期接入、资源准入前置校验 |
| `examples/programs/chatgpt-mindmap/src/answer-registry.js` | 回复识别后的控制器与恢复原文、全屏协调 |
| `examples/programs/chatgpt-mindmap/src/chatgpt-adapter.js` | ChatGPT DOM/操作栏安全选择器 |
| `examples/programs/chatgpt-mindmap/src/extract.js` | 提取语义回复树 |
| `examples/programs/chatgpt-mindmap/src/view.js` | 原位 Shadow DOM Icon Toolbar 与画布壳 |
| `examples/programs/chatgpt-mindmap/src/xmind-adapter.js` | 真正 XMind SDK Workbook、缩放、测量和销毁 |
| `examples/programs/chatgpt-mindmap/src/xmind-convert.js` | 思维树到 XMind Workbook 格式转换 |
| `examples/programs/chatgpt-mindmap/assets/ui.css` | Shadow DOM 隔离的 Program 控件样式 |
| `examples/programs/chatgpt-mindmap/scripts/audit-build.mjs` | 产物 SHA-256 / draft / 当前源码一致性审计 |
| `examples/programs/chatgpt-mindmap/tests/{extract.test.mjs,xmind-adapter.test.mjs,xmind-provenance.json}` | Program 专项源码测试和四份固定资源的来源锁 |
| `examples/programs/chatgpt-mindmap/preview/{index.html,app.js,preview.css}` | 独立真实 XMind 功能实验台（不属于正式 Host） |
| `examples/programs/chatgpt-mindmap/preview/{chatgpt.html,chatgpt.css,chatgpt.js}` | ChatGPT UI 模拟外壳；共享正式 Program 控件和适配器 |
| `examples/programs/chatgpt-mindmap/preview/{serve.mjs,verify-assets.mjs,README.md,design.md}` | 预览运行、安全字节验证、说明、未批准设计合同 |
| `examples/programs/chatgpt-mindmap/preview/{jszip.min.js,polyfill-45b9836beb.min.js,xmind-sdk.bundle.js,snowbrush-2c2b5d62b5.js}` | 四份只在预览中直接加载的固定原始 JS，**不是**正式 Program 资产 |
| `examples/programs/chatgpt-mindmap/README.zh-CN.md` | 用户/开发者文档 |

## 3. Browser 公共依赖与具体调用链

1. `examples/programs/chatgpt-mindmap/src/main.js` 静态导入 `@opendesk/ui` 的 `createPageUI`。编译时 `scripts/build-program-project.mjs` 将该 bare import 映射到已有 `PAGE_UI_MODULE`；不新建浏览器宿主 API。`assets/ui.css` 作为 Program CSS 资产经标准构建器嵌入。
2. 初始化先调用 `requireXmindRuntime(window)`，如果当前执行世界没有 `JSZip`、`Workbook`、`Topic`、`Dumper` 与 `_SB_.createWorkbookEditor`，立即报 `E_XMIND_RUNTIME_UNAVAILABLE`，**不会**降级到假导图或通过 MAIN 世界找对象。
3. 环境具备原始 XMind Runtime 时，`createPageUI({baseStyles:false,...})` 创建受管 UI owner，`createAnswerRegistry` 持有每条回复的控制器：`chatgpt-adapter.js` 选择回复 -> `extract.js` 转换语义 -> `view.js` 渲染 Program 私有 ShadowRoot -> `xmind-convert.js` 提供 Workbook 数据 -> `xmind-adapter.js` 调用真实 SDK。关闭时通过 owner/registry 释放监听和 Workbook。
4. 安装侧使用既有通用路径 `src/ui/page-program-library.js` -> `src/platform/host/broker.js` -> `src/scripting/user-scripts/installed-programs.js` -> `src/scripting/user-scripts/page-program-package.js` -> `chrome.userScripts`。独立 Program 不直接访问安装数据库/扩展权限，也不在宿主增加 Mind Map 专用模块。
5. 浏览器宿主通用注册检查依赖 `page-program-contract.js` 等源 hash、Manifest 和 `world: USER_SCRIPT` 约束。用户脚本及资源必须先成为经现有流程验证的候选，不能把独立构建成功等同于已原生注册。

## 4. 编译模块/资源边界（实际 CI 记录）

- Source Run：`https://github.com/shopable-ai/opendesk-browser/actions/runs/38862508682`；`offline-source-contract` 为 **SUCCESS**，包含 `validate-program-project`、`npm run build:program`、`audit-build.mjs` 和 `npm run check`。
- 该 Run 的 `sourceModules` / `sourceFiles` 包含且仅列出独立 Program 的七个 `src/*.js` 业务模块：`main.js`、`answer-registry.js`、`chatgpt-adapter.js`、`extract.js`、`view.js`、`xmind-adapter.js`、`xmind-convert.js`。标准 `@opendesk/ui` helper 通过 builder 受控 alias 打包；固定四份 XMind JS **未**声明在 `package.json#opendesk.assets`、**未**作为正式资源打进 Program。
- 声明的唯一 Program 资产为 `assets/ui.css`（CI 校验 4,360 B）。业务 Toolbar CSS 位于 ShadowRoot；实际 Snowbrush 的 `snowbrush_style` 全局样式残留依旧是 `BLOCKED_GLOBAL_STYLE_RESIDUE`，不能以 Shadow DOM 控件样式掩盖原始引擎对页面的全局影响。
- 已检查的通用限额：`scripts/program-assets.mjs` 声明资源总量 60 KiB；`src/scripting/user-scripts/page-bundle.js` 普通 Page 源码上限 128 KiB、受控 linked resource 上限 512 KiB。四份 XMind 资源共 4,042,573 B，远超上述通道的直接资产限额，不能规避或扩大限制以假装安装就绪。
- 将来升级 XMind SDK，在合法资源许可和已有 SDK Runtime 支持的前提下应只改 Program 源码/固定资源锁；若需要全新可信资源通道，必须经过**独立、通用、安全**框架评审及宿主回归，不能做 Mind Map 特例。

## 5. 构建候选真实性（不是安装）

| 字段 | 已核验数值（GitHub Actions #38862508682） |
| --- | --- |
| Program ID / version | `opendesk.chatgpt-mindmap` / `0.2.0` |
| Runtime / status | `page-userscript` / `BUILT_UNVERIFIED` |
| installable | `false` |
| sourceBytes | `52867` |
| sourceHash = buildHash = program.js SHA-256 | `a9e4f3056308c03aa4288aab616d3d0d5fa86bd919a4088b9de2462c8b3b8811` |
| program.opendesk-draft.json SHA-256 | `be774be26d4d91aef944323b0bcf01f57c519c5d64e90f9db0907d381b366ac3` |
| artifact.json SHA-256 | `b6d63caa10ca429ec8b5d93a5c88c782a5ce85838671d605b1431a46a8c33fab` |
| source freshness | `MATCHES_CURRENT_PROJECT_SOURCE`（对于本次 CI checkout） |
| Linux CI 输出绝对目录 | `/home/runner/work/opendesk-browser/opendesk-browser/artifacts/programs/opendesk.chatgpt-mindmap/0.2.0/r31-production/a9e4f3056308c03a-79bfc7931165` |
| 构建候选 Artifact | `https://github.com/shopable-ai/opendesk-browser/actions/runs/38862508682/artifacts/12029358342` |

Hash 与绝对路径来自 CI stdout `PROGRAM_BUILD_CANDIDATE_AUDIT`，不是推导的 Mac 路径。CI 产生并验证 `program.js`、`program.opendesk-draft.json`、`artifact.json`；本次环境**不能检查用户 Mac 工作树**，Mac 产物为 `NOT_TESTED`。

## 6. Chrome/Browser 分层验收与阻塞

| 层次 | 当前状态 | 证据边界 |
| --- | --- | --- |
| GitHub 独立 Program 源码 | `SOURCE_VERIFIED` | 远端真实文件树、明确独立归属 |
| Program 候选构建 | `BUILD_PASS`（Run #38862508682 的离线 Job） | hash、候选路径、Artifact 与 `installable:false` |
| Browser MV3 `dist/development` / `dist/production` 实际打包包含该 Program | `NOT_TESTED` | 没有 Mac/Browser 编译包字节级检查；不可因 `dist` 名称推断包含 |
| 安装管理器发现、验证、授权该具体候选 | `NOT_TESTED` | 通用安装管理器源码存在不等于当前 Program 已导入 |
| 本机 Chrome `userScripts.getScripts()` 注册、授权、运行、Stop、撤权、卸载 | `NOT_TESTED` / 生产 Runtime `BLOCKED` | 没有用户 Mac Chrome profile/Native 结果 |
| 本地 HTML 原始 SDK 预览 | `PENDING_CHROMIUM_CLOSURE` | 单独真实 Chromium CI；不是生产已安装 |
| 真实登录 ChatGPT DOM 校验 | `NOT_TESTED` | 当前是模拟 ChatGPT 页面 |

阻塞：`E_XMIND_RUNTIME_UNAVAILABLE`、固定引擎及 GSAP/第三方资源许可证完整审计、原始 JS 在 `USER_SCRIPT` 世界内的可信资源准入与总容量、Snowbrush 全局样式残留，以及生产实际撤权/卸载与 BFCache/旧页脚本状态。禁止通过 MAIN-world 注入、放宽 CSP、伪造安装证明、调大限额、设置 `installable:true` 或另设安装器绕过。

## 7. 审计复现与交付门槛

在**有完整仓库**的环境运行：

    node examples/programs/chatgpt-mindmap/preview/verify-assets.mjs
    node --test tests/environment/chatgpt-mindmap-preview.test.mjs
    node --test tests/environment/chatgpt-mindmap-r1.test.mjs
    node scripts/validate-program-project.mjs examples/programs/chatgpt-mindmap
    npm run build:program -- examples/programs/chatgpt-mindmap
    node examples/programs/chatgpt-mindmap/scripts/audit-build.mjs
    npm run check

Chromium 专项使用 `tests/framework/chatgpt-mindmap-xmind-probe.mjs` 与 `tests/framework/chatgpt-mindmap-chatgpt-probe.mjs`；实际 PNG 必须逐张打开审阅、保存带 SHA-256 的 `screenshot-evidence.json` 后才能填写 `VISUAL_PASS` 或 UX ≥95。无证据时使用 `SCREENSHOT_NOT_VERIFIED` / `NOT_TESTED`。预览设计继续 `PENDING_USER_CONFIRMATION`。

本轮更新涉及的 Git 提交：`86a970560c2fce0a07a00f09e80071a2028a364b`（容器查询/Focus/专项断言）、`77a8cf9ee499f3f130ef7b874f9ebe4d87b866f4`、`f6cee5b1c9c0bd80deafead06d9f77c920805069`（旧 Chromium 探针定位器）。**这些提交均未改变仓库根目录 `src/`。**

## 8. R3.6 后续实测补充（2026-10-16）

本轮通过 `https://github.com/shopable-ai/opendesk-browser/actions/runs/38865072908` 验证：`offline-source-contract` 和 `real-local-xmind-html` 均 SUCCESS，完整 Chromium 输出中的独立真实 XMind SDK 交互为 PASS，ChatGPT 模拟产品 27 条检查为 PASS，浏览器异常/外部请求 0。320px 内容宽 320，画布实际宽 318，根节点宽 180 且可见宽 180；菜单两项均为 158×44px，真实原始 XMind 横向滚动范围得到验证（scrollLeft 176→411）。`screenshot-evidence.json` 记录本轮 Git SHA、Chrome 版本、topic 数及逐张真实 PNG SHA-256。已逐张打开重点桌面/320px/菜单/全屏截图，但用户预览尚未确认，保持 `PENDING_USER_CONFIRMATION`。

本轮 `691ffa15a35b1a487cdb92f7c0cccb24e25ad5f6` 的真实 Program build：

| 字段 | 值 |
| --- | --- |
| 构建状态 | `BUILT_UNVERIFIED` / `installable:false` |
| `programId` / `version` | `opendesk.chatgpt-mindmap` / `0.2.0` |
| `sourceBytes` | `53841` |
| `sourceHash` = `buildHash` = `program.js` SHA-256 | `e17e473394c6b8269277ff1373c831346706d03f6bbfb912c759767194f25799` |
| Draft SHA-256 | `e44eae02bf790ec8a4a0811e809ff2e76b8d013d8b8d69895dd40e2faa94546a` |
| Artifact JSON SHA-256 | `98790b297745590b4378dbc52fe625224912fe3fb2dfce4b673fc87f6d3803aa` |
| CI 输出绝对路径 | `/home/runner/work/opendesk-browser/opendesk-browser/artifacts/programs/opendesk.chatgpt-mindmap/0.2.0/r31-production/e17e473394c6b826-98444e05e46f` |

上述三个文件已从 Actions Artifact 下载，在独立容器重新计算 SHA-256 **全部匹配**；它不是用户 Mac 原生路径，更不是 Host MV3 注册证明。Program 业务 JS 源文件仍是独立项目七个模块，宿主根 `src/` 未修改。图片和源码阶段的通过均不能解除 `BLOCKED_GLOBAL_STYLE_RESIDUE`、`E_XMIND_RUNTIME_UNAVAILABLE` 和许可证/USER_SCRIPT 合规审查。

