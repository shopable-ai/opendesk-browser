# 项目依赖、JSON 分发与执行世界：设计收敛

日期：2026-10-12。源码核对基线：`b77a2a80ae026c30746ab0329f957d467fddb72e`。

**状态：源码核查后的架构决策与实施合同，不是 ECharts/CDN 通用加载器已经实现的声明。** 本文及 README 导航的更新不改变运行代码、安装格式、权限或既有冻结 JSON；不构成 Chrome、安装、Stop 或生产验收 PASS。

> 上述状态对应 `b77a2a80` 的原设计快照，历史正文保留。本日后续已有源码实施：见下文第 9 节及 [React HTTPS ESM / ECharts 工作记录](../../framework/workstreams/react-url-import-echarts-20261012.md)。各项真实验收以该记录绑定的输入和原始回执为准。

## 1. 结论与前一轮方向纠正

主路线继续是 **JavaScript/React/Vue 项目 + 标准 import + 项目配置/锁 + 原有 JSON 分发和执行器**。用户仅能编写自己的代码或项目，不能修改扩展本体；这意味着框架应承担准备、链接与加载，而不是要求用户维护扩展的 src/libs、manifest 或 SW。

不得把借鉴油猴的 `@require` 变成 OpenDesk 的主作者协议。旧 UserScript 元数据仅保留现有兼容边界；前一轮尚未合入的 `page-dependency-panel.js`、新增 @require 审批面板及以该路径替代 React Demo 的方案，不作为本任务后续集成候选。不得为让 React + CDN 工作而直接删除 `E_BUILTIN_CONFLICT` 或放宽世界/CSP。

同时避免另一种偏离：要求普通使用者下载仓库、安装 Node/npm、执行锁定 CLI，不能被当成浏览器安装 JSON 工具的完整用户体验。维护者构建工具和最终用户安装工具是不同角色。已有本地项目继续使用保存后自动准备、明确 Run；已有浏览器 JSX/SFC 编译入口继续存在，不能被改回必须依赖 Native。

## 2. 本次核实的源码事实

| 文件 | 已有行为 | 不能据此声称 |
| --- | --- | --- |
| `examples/programs/page-ui-react-direct/package.json` | `opendesk.project.v1`、`runtimeKind: page-userscript`、`sourceFormat: esm`、`framework: react`、`entryMode: component`、`world: USER_SCRIPT`；当前没有声明额外 npm 依赖 | 不是可直接安装的 sidebar-tool JSON，也没有通用 CDN 配置字段 |
| `scripts/build-program-project.mjs` | 将本地/固定 npm/已锁定 HTTPS ESM 链接进固定 program.js；生成草稿 JSON；React 由固定框架资源提供 | 不是运行时从 npm/CDN 解析安装依赖；BUILT_UNVERIFIED 不等于已安装 |
| `src/ui/sidebar-tools/package.js` | v1 严格接受 html/css/js 等固定字段；v2 的 requires 只接受 browserSdk=1.0.0，contributes 处理受限右键菜单 | v2.requires 不是任意 npm/CDN 依赖表；不能往现有严格包塞未经实现字段 |
| `src/scripting/user-scripts/execution-source.js` | 校验内置库/框架字节，在 USER_SCRIPT 中组装代码；当前禁止 @opendesk-lib 与 @require 混用 | 给 React 草稿增加 @require 面板不等于支持 React + 第三方依赖 |
| `src/ui/page-dependencies.js` | 只读查找并复用既有批准锁；未锁定 @require 仍阻断 | 新 @require 准备/批准 UI 尚未成为本次基线中的产品能力 |
| `docs/architecture/browser-framework/https-esm-imports-r1.zh-CN.md` | 已定义静态 HTTPS ESM 的本地显式审阅、锁与离线构建 | 不代表浏览器只编辑脚本即可自动下载任意模块；也不是 UMD script-tag 加载器 |

生成产物里可能存在 `@opendesk-lib react` 等内部声明。它是当前构建器和执行器的传递机制，不要求作者手写油猴头部。不得为了改变作者体验破坏旧执行产物和哈希。

## 3. 三层必须分开

### 作者层：自己的项目与源码

- 普通 npm 库：项目根的标准 `dependencies` 声明精确版本，配套项目锁；源码写 `import`。不要将用户项目依赖添加到 OpenDesk 根 dependencies 或复制进扩展 src/libs。
- 确需指定 CDN 的 ESM：源码可写标准静态 HTTPS URL import，清晰显示网络来源；沿用既有安全锁定和离线链接。不可把 UMD 的 `dist/*.min.js` 当作具有 ESM exports 的模块。
- 内置 React/Vue：保留 `opendesk.framework` 及标准框架 import，避免重复打入第二份 React/ReactDOM。
- 浏览器里只有单文件编辑权限：目标是由现有组件准备器将源码及 import 解析为一个受控项目快照，依赖来源归入同一份锁与安装审阅。通用 npm/HTTPS 模块图在此入口的自动准备仍需实现；不通过改成 @require 或要求访问扩展仓库掩盖缺口。

下面只是标准 npm 项目字段示意，不是已配置好的可运行 ECharts Demo，也不是最新版本推荐：

```json
{
  "dependencies": {
    "echarts": "6.0.0"
  }
}
```

`opendesk` 原有字段保留。仅加 dependencies 不足以运行：还需要真实依赖安装/锁定、必要模块链接、最终字节预算和相应环境验收。系统自动准备并不意味着用户主动 Run 会静默执行 npm install 或访问未知 CDN。

### 分发层：JSON 是包，不是新 Chrome 扩展

小依赖优先在准备期裁剪并链接进现有执行 JS，由现有包承载。安装者拿到冻结 JSON，不需要 npm、CDN 账号或本地构建器。项目 package.json、Page 草稿/候选、Controller 任务包、Side Panel 工具包不是一种格式；接收入口和运行世界必须保持区分。

大型运行库若仍无法满足当前预算，需要新增**版本化的运行资源能力**：在既有对应包格式中承载固定资产清单，资产可内嵌，或由安装器在明确确认时取得与清单哈希一致的字节。后者是有网络前置的安装方式，不能冒称完全离线包。

设计要求不是现在就向 v1 或现有 sidebar-tool.v2 添加 `cdn`、`runtimeAssets`、`dependenciesLock` 等未实现字段。最终字段与版本号由源 schema、构建器、导入器、存储、执行器共同实现；sidebar-tool.v2 已被其他能力使用，不能复用其版本号冒充新的不兼容合同。

### 执行层：库必须进入消费者所在的环境

- Page React 项目：React、链接后的第三方库和组件源码进入同一个受批准的 USER_SCRIPT 世界，操作该网页中的受管容器。
- Side Panel 工具：库及组件在工具自己的 opaque-origin iframe 中运行；图表显示在 Side Panel 内时，不向目标网页注入图表库。与网页通信只能走现有受限桥接。
- 扩展宿主/SW：只执行扩展发行包内可信代码，不能把用户 JSON 中的 JS 作为后台模块执行。
- 用户/网站 MAIN 世界：仅在确有站点全局交互需求时另行设计授权和适配；不是为了加载 ECharts 而默认切换到 MAIN。

内容哈希相同可以复用**磁盘字节**；不能共享跨工具授权、跨文档实例或跨世界对象。USER_SCRIPT 可操作 DOM，不代表拿到另一个世界的 `window.echarts`。Shadow DOM 隔离样式与结构，不构成独立 JavaScript 安全世界。

## 4. 为什么不把 CDN script 标签插到目标页面

普通网页里的 `<script src="https://.../echarts.min.js">` 通常在网页 MAIN 环境执行，受页面策略和网络可达性影响。当前 Page 项目选择的是 USER_SCRIPT；把库放进 MAIN 后，组件并不会因此获得同一个模块对象。把整个组件也移进 MAIN 又改变了原权限与隔离承诺。

直接 script-tag 加载还不能自动解决依赖顺序、版本冲突、更新后的字节漂移、失败处理、缓存丢失、撤权、React 卸载和异步晚到等问题。删除标签也不会卸载已经运行的库或撤销网络/页面副作用。

应使用已有受限执行 API 将**预先固定并校验过的代码**装载到正确环境，而不是把 CDN URL 当作浏览器执行命令。Chrome userScripts 的 ScriptSource.file 是扩展包相对文件路径，不能填 CDN URL 或 IndexedDB 缓存路径；下载后的用户代码只能在对应许可范围内通过 code 等既有执行机制传递。

合规边界同样不能省略：Chrome 对 User Scripts API 和与扩展 API 隔离的环境有特定远程代码例外，但例外仅限其用途与对应代码区域。把代码包成 JSON、先下载到缓存、加 SHA-256 或取得一次用户确认，都不会自动让它成为可在 SW/特权扩展页运行的“本地可信代码”。最终需按实际分发方式和功能接受审核。

## 5. 外部依赖的完整生命周期（目标实施合同）

```text
作者保存源码/项目依赖声明
  -> 离线识别本地、内置、npm、HTTPS 来源及实际使用模块
  -> 在既有准备/安装流程中明确确认新的网络获取
  -> 受限下载；保留原始来源、字节、版本、许可证与哈希
  -> ESM/UMD 适配和裁剪；锁定转换器及最终执行字节
  -> 生成原有包或明确的新版本包；验证兼容性和大小
  -> 用户审阅并安装固定版本（不是立即操作网页）
  -> 用户明确 Run，或由已授权的自动运行规则触发
  -> 复验工具/包/依赖锁/权限/tabId/documentId/world 身份
  -> 同世界初始化依赖；确认导出 API 已就绪
  -> 挂载 React/Vue 组件；由组件创建并更新图表
  -> Stop/关闭/导航/替换时执行清理
  -> 更新创建新锁；卸载按引用回收无人使用的缓存
```

装载顺序是依赖图的顺序，不是靠 setTimeout 等待。同步失败必须阻断后续业务；异步初始化必须有界等待并检测取消/源码或文档变化。晚到的加载不得在已 Stop 的组件中重新挂载。初始化报错不切换 CDN、执行世界或旧版本继续跑。

安装器保留 URL 来源和实际执行字节的对应关系；显示“CDN 来源，安装时已固定，当前使用缓存”，不能把固定内置 React 伪装成网络下载。默认不增加独立的 @require 地址框、依赖管理 Tab 或版本弹窗堆栈，复用已有项目/安装/更新详情。确需 Chrome 新权限时仍由真实用户操作申请，不能通过减少点击绕过权限要求。

数据网络请求与下载执行代码是两类能力。禁止 Run 临时补 JS 依赖不等于禁止工具在获准后请求业务数据，也不代表 USER_SCRIPT 是阻止外传数据的网络沙箱。

## 6. ECharts 的具体使用与清理

作者优先采用 ECharts 官方模块接口，例如只引入 `echarts/core`、`BarChart`、`GridComponent` 和一种 renderer，再 `echarts.use(...)`。完整包并非不能用，但需要根据真实构建测量决定交付方式；不能仅因原 JS 报文上限而永久改成一个 D3 数学函数并声称完成 ECharts 支持。

React 组件负责这些生命周期动作：

1. 受管容器已挂载且有有效宽高后调用 `echarts.init`；数据变化调用 `setOption`，不每次 React render 重建实例。
2. `ResizeObserver` 观察图表容器并调用 `resize`；收起到零尺寸时不忙循环初始化，展开后再调整。
3. `useEffect` 清理函数断开 observer、移除图表/DOM 事件并调用 `dispose`；框架继续负责 root.unmount 和宿主销毁。
4. 使用错误状态与降级文字展示真实失败；不能由下载成功或 preview 求值成功推断 Canvas/SVG 已绘制。
5. 默认不向目标网站写全局 echarts、替换网站 React、修改网站 CSP 或把图表实例挂到扩展宿主全局。

Stop 能清理登记过的实例、监听和 DOM；任意第三方 JS 的顶层副作用、已经提交的请求和已执行代码不能承诺完全撤销。彻底隔离/清除状态可能需要结束原 iframe 或原网页文档，不能把 world 配置 reset 当成销毁世界。

## 7. 实施顺序与不能跳过的验收

**先完成真实 ECharts 的准备/体积验证**，再决定是否需要运行资产合同，不先扩大所有上限。源 JS、依赖字节、JSON 转义/Base64 后报文、解压后大小、解析和运行内存分别计量；这些是不同预算。

| 实施切片 | 主要复用位置 | 关闭条件 |
| --- | --- | --- |
| 源码与配置 | 原项目 schema/validator、标准 import、browser component preparer | 内置框架不重复；依赖缺失可解释；不要求用户修改扩展 |
| 准备与分发 | 原 HTTPS 锁、项目构建器、各包的 serializer/validator | 精确来源/版本/字节；固定包重建一致；未知格式拒绝 |
| 大型资产（仅必要时） | 版本化包、受限存储/安装链、现有执行器的适配 | 旧包继续工作；新包旧客户端明确拒绝；不绕过总预算 |
| Page 与 Side Panel 执行 | Page USER_SCRIPT、各工具 sandbox 分别适配 | 同世界导出有效；不写网站全局；不在特权宿主 eval |
| 浏览器仅源码入口 | 现有组件准备/安装入口，不新造编辑器 | 无 Native/CLI 的新依赖准备确实完成后才标支持 |
| 原生生命周期 | 原 Run/Stop/卸载及权限/文档身份链 | 真实 ECharts 绘制、resize、数据更新、Stop、重新运行与清理 |

定向负例至少覆盖：未授权下载、来源漂移/哈希不符、依赖缺失、错误 MIME/超限、UMD/ESM 不兼容、React 双实例、离线运行、初始化异常、相同来源多版本、加载中 Stop/导航/源码变化、权限撤销、更新回退、两工具同库不共享授权、卸载不误删他人引用、严格 CSP 页面。

本次没有运行 ECharts 构建或真实 Chrome 验收；不得以本设计表推导 95 分、完成率或生产 PASS。下一次应按这些切片直接实施，而不是恢复上一轮未提交的 @require 面板。

## 8. 参考与证据入口

源码优先：
- [React Direct 项目](../../../examples/programs/page-ui-react-direct/package.json)
- [项目构建与草稿生成](../../../scripts/build-program-project.mjs)
- [工具包 v1/v2 合同](../../../src/ui/sidebar-tools/package.js)
- [Page 代码装配与冲突准入](../../../src/scripting/user-scripts/execution-source.js)
- [现有依赖只读解析 UI](../../../src/ui/page-dependencies.js)
- [HTTPS ESM 的既有合同](https-esm-imports-r1.zh-CN.md)
- [Side Panel 工具开发](../../api/sidebar-tool-development.zh-CN.md)

公开依据（2026-10-12 查阅；技术可行不等于商店预先批准）：
- Chrome User Scripts API：https://developer.chrome.com/docs/extensions/reference/api/userScripts
- Chrome 隔离世界与 CSP：https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome MV3 特定远程执行例外：https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Chrome 远程代码说明：https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- ECharts 模块化引入：https://echarts.apache.org/handbook/en/basics/import/
- ECharts 容器、resize 与 dispose：https://echarts.apache.org/handbook/en/concepts/chart-size/

## 9. 同日实施补充：复用原链路的版本化适配

这部分更新实现状态，不改写上文的历史核查结论，也不登记全仓、Mac、F3 或 ZIP PASS。

### 9.1 真实图和测量先于容量适配

原 `page-ui-toc-react-direct` 现使用 ECharts 5.6.0 的真实 `core.js`、bar、grid、SVG renderer 静态 HTTPS ESM import；D3 的顶层 URL 和统计调用保留。固定 ZRender 5.6.1、tslib 2.3.0 后，实际完整远端图是 235 个模块、1,744,686 B，最大模块 84,388 B。生产固定源为 482,082 B，含作者源码/锁的 JSON 为 558,789 B。原小图/普通源码预算确实不足，因而增加下列限定版本，不提高所有上限。

| 层 | 实际合同 | 兼容边界 |
| --- | --- | --- |
| 作者项目 | 原 `opendesk.project.v1` 内可选 `remoteDependencies`，格式 `opendesk.remote-dependencies.v1`、Page `page-library-v1` 与最多 8 个固定 HTTPS import 映射 | 仅 Page；不能覆盖 React/Vue、绕过路径/URL 检查或作为运行时 npm 解析器 |
| 原始锁和缓存 | `opendesk.remote-lock.v2` 保存 profile、imports、逐 URL SHA/字节；复用原内容寻址缓存、网络边界和显式审阅 | 最大 256 模块/2 MiB，单模块 128 KiB 不变；原 v1 保持 32 模块/256 KiB |
| 固定执行资源 | `opendesk.page-linked-resource.v1` 描述行 + 完整 linked JS，保留在原 `sourceUtf8` | linked JS 512 KiB，描述 4 KiB；只接受 USER_SCRIPT，完整字节和锁身份校验失败即阻断 |
| JSON | `opendesk.program-draft.v2` 增加 `authoring.remoteLock`，仍使用原导入、Candidate、验证和安装流程 | v2 768 KiB；旧 v1 不变；未知版本拒绝；源码快照不冒充编译证明 |
| 存储/更新/卸载 | 固定执行资源跟随原 Candidate、revision、grant 和已安装 Page 记录 | 不增加需要运行时取得的资产；仍按原程序版本/文档身份更新和卸载 |
| Native reverse 读取 | `localDevSourceVersion=1`；原 `project.resolve` 返回固定产物引用，再 `project.source.read`、`project.source.validate` | 单块 24 KiB、整体源 516 KiB、有界 TTL/并发；原 61,440 B 帧上限不变 |

完整 USER_SCRIPT 执行 JS 718,450 B；包含固定框架和内置资源，排除准备器 Babel、Vue、可选库和 source map。Native 原 inline 响应约 491 KB，分块后的最大实际响应 JSON 33,331 B（含长度头 33,335 B）；完整序列化报文与输入哈希保存在工作流证据中。

### 9.2 浏览器源码与冻结 JSON 入口分别适配

原组件准备器的固定 Worker 只解析、转换并链接文本，不执行用户依赖。浏览器作者在同一编辑器依次“检查依赖 → 确认获取所列模块 → 审阅完整图并确认固定”。每个新传递 URL 都需明确确认。保存、Run、重试读取批准锁和核验缓存，不隐式下载；编译缓存命中也重新核验原始字节。

浏览器单文件入口当前沿用小图 v1 限额：32 模块、整图 256 KiB、链接结果 100 KB，不等于已支持本地 ECharts 完整图或任意网络模块。固定 JSON 则导入完整产物，原组件模式进入 managed UI；保存只创建 Candidate，Run 需要明确操作，原 Stop 回执对应原 preview/source/document 身份。未知效果只查询原回执，不自动重放。

浏览器已确认的作者 review/lock/cache 按原持久缓存规则保留。目前没有“遗忘固定版本”或原始字节 GC；卸载自包含 Page 产物不代表删除作者准备缓存。不得将现有 namespace 字节复用描述为共享跨程序安装授权。

### 9.3 生命周期与仍需独立验收的边界

真实图表 effect 在有效尺寸后 init，数据变化 setOption，容器变化 resize；清理断开 observer、取消 RAF 并 dispose。原 TOC listener/observer 随 root.unmount 清理。准备取消、Stop、源码变化用代际检查阻止迟到挂载；版本导入先停止原预览。模型负例及包验证与真实 SVG/回执分别报告。

仓库内 Node 参考 Host 已实现上述分块能力；正式外部 Go Host 尚需独立适配，实验 Node Host 不能代替正式 CLI 所需的 R17 能力。主动 MCP `session.run` 大报文仍明确 `E_LIMIT / NOT_DISPATCHED`。冻结 JSON 的安装和运行不需要 Native。

本轮不能访问用户 Mac；Linux 本地 CFT 因 AF_UNIX 被环境拒绝。专用 GitHub Chrome 工作流覆盖真实 JSON、ECharts 数据/尺寸变化、Stop、安装/新文档，并单独检查浏览器源码首次 HTTPS 准备；是否通过、对应 packageHash/previewId/documentId 必须读取该任务实际原始证据，不能由本节设计说明推定。
