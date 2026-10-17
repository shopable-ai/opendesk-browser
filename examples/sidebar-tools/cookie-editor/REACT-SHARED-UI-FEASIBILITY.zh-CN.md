# Cookie Editor：React 19 共用 UI 组件与可信直渲可行性开发说明（R0 / 未验证）

> **状态：PROPOSAL / SOURCE_AUDITED_ONLY / TECHNICAL_FEASIBILITY_NOT_TESTED。** 本文为 2026-10-17 的开发说明与候选比较，不是最终技术选型、上线批准或真实 Chrome 验收。现有 Cookie Editor 2.0.23 正式包、安装身份、授权、数据与旧 JS 均保持原状。除本文外，本轮不修改任何正式产品代码。若最新 main 改变，下列计数必须重新计算。

## 1. 为什么写本文；与已有文档的关系

已存在且依然生效的架构文档：
- [可信 UI / 动态工具沙箱边界](../../../docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md)：**经审核、随扩展静态编译的第一方 UI 可以直接挂载宿主，无需 iframe**；普通用户/AI/第三方动态安装代码即使自称官方、作者为管理员，也不得因名称或配置提权。
- [R33 可信 React 单 Root / 组件归属](../../../docs/architecture/react-ui-shared-components-r33.zh-CN.md)：目前唯一可信共用组件源码位于 \`src/ui/react/components/ui/\`，不先建立 \`packages/opendesk-ui-react/\` 或第二套共享组件包。
- [Cookie Editor 首轮迁移工作记录](../../../docs/framework/workstreams/cookie-editor-react-shared-ui-20261017.md)：正式业务迁移、SDK/Host、正式版 2.0.23 和预算等保护。
- [Cookie React 已审 UI 记录](preview/react/README.md)：R4.9.2 基线，后续 R4.10.x/R4.11 的交互修改需以实际最新源码、用户决策为准；旧文档可能仍描述已废弃的导入预览或双重确认。
- [Trusted UI 边界实证记录](../../../docs/framework/workstreams/trusted-ui-render-boundary-20261017.md)：Time Review 已有固定编译/官方身份/版本和撤权机制；不可自动推及 Cookie Editor。

此前首轮迁移工作记录偏重“继续保留沙箱的 React 工具”，**遗漏了值得验证的静态可信 UI 候选及其对 React Runtime 共用的影响**。本文增补这部分，不改写以上权威安全和产品规范。

## 2. 当前有多少“真正共用”（静态 main 文件检查）

读取：\`src/ui/react/components/ui/button.tsx\`、\`src/ui/design-tokens.css\`、\`src/ui/design-system.css\`、\`examples/sidebar-tools/cookie-editor/preview/react/src/App.jsx\`、\`style.css\`、\`index.html\` 与现行正式 \`src/main.js\`、\`tool.config.json\`。

| 指标 | 核查结果 | 解读 |
|---|---|---|
| 可信 React 共用组件 | **2 个：Button / IconButton** | 同文件约 809 字节，不能把拟议的 shadcn/React Aria 全组件库算作已交付 |
| 共用 CSS 外观原语（类别） | **5 类：od-button / od-icon-button / od-field / od-surface / od-disclosure** | 已有视觉样式，包含多种变体；不等于 5 个 React JSX 组件 |
| 共用设计系统 | \`design-tokens.css\`（约 2.6 KB）和 \`design-system.css\`（约 10.6 KB） | 可信宿主直接使用；沙箱只能按现有受控构建提取/映射，不能运行时继承特权宿主样式 |
| Cookie React JSX 对公共 React 组件的 import | **0 处** | Cookie React 自己定义 \`IconButton\`、\`Field\`、\`Message\`；当前“真正复用的 React 组件比例”为 **0%** |
| Cookie JSX UI 使用 | 9 处 \`<IconButton>\`、20 处原生 \`<button>\`、8 处 \`<Field>\` | 是候选替换点，不意味着 37 处均可无损改成相同组件 |
| Cookie React CSS | 约 19.3 KB，约 230 个规则块、78 处 \`#hex\` 颜色文字出现位置 | 部分是重复色值，不能把 78 次出现当作 78 种颜色；必须先逐项映射 Token |
| Cookie React 预览 IIFE | 从单文件 HTML 的 base64 JS 解码计算约 **224,756 bytes** | 已超过现有独立工具主 JS 220,000 的原始预算，**不是**“共享 UI 组件可直接进入 JSON 包”的证明 |
| 当前正式 Cookie Tool | \`opendesk.sidebar-tool.v2\` / 2.0.23；正式 JS 仍是原生代码 | 本次没有 React 正式替换，不能把预览 JSX 当作现有正式业务 |

**严禁推测“已经共用 60%/70% 代码”**。上述复用率 0% 专指 React UI 组件 import，不包括产品视觉相似性、框架公用 Host、SDK 和未来可共用代码。也不能用 \`9+20+8\` 直接除以 JSX 行数计算复用率。

## 3. 两种路线，不再混淆“组件复用”和“运行时可信”

| 维度 | A：独立 React Sandbox Sidebar Tool | B：经过审计的第一方 Trusted React UI（推荐**先做最小可行性试验**） |
|---|---|---|
| 代码来自哪里 | 安装在 iframe 中的本地预编译 \`.opendesk-tool.json\` | 浏览器扩展构建时静态 import 的**已审计固定源码**，不是运行时安装包 HTML/JS |
| iframe | **保留** opaque-origin iframe | 对被严格准入的固定 UI **可以不使用** iframe |
| React Root | 工具自己的 Root、自己的 React Runtime | 由现有可信 Side Panel React Root/Portals 绘制，**同一宿主文档不创建第二 Root** |
| UI 组件和主题 | 仅**编译时复用源码/视觉规则**；样式仍在独立沙箱文档中 | **共享宿主 React Runtime、组件源码与设计 Tokens**，无需额外宿主内 CSS 前缀或 ShadowRoot |
| JS/包体积 | 每个工具通常各自打包 React；须过单 JS 220,000/工具总 JSON 320,000 原始字节门槛 | 不再把第二份 React Runtime 加入工具 JSON；但是**扩展固定构建体积增量待实测**，不可宣称无成本 |
| 开发和发布 | JSX → Vite 编译 IIFE/CSS → 原有包校验 → 独立工具安装/升级 | JSX → 现有 WXT/Vite 构建 → 更新整个浏览器扩展；还需审核固定准入和安装/撤权身份 |
| 权限 | 仍通过 OpenDeskSDK / 可信 Host / 原有许可 | **绝不直接信任安装包 JS**；即使 UI 代码在宿主中，也必须经受审计的 Host 行为、真实用户手势和权限检查 |
| 更新便利性 | 能独立更新单个工具的 JSON | **不能只更新 JSON 就把新组件代码送进宿主**，需要扩展本身升级 |
| 当前实际完成 | 原生正式 Tool 正常存在；React 预览已有但正式迁移未做 | Time Review 有安全先例；**Cookie Editor React Trusted 准入、交互、尺寸均未验证** |

**取舍**：Cookie Editor 是高权限、敏感数据的官方功能。可以优先做路线 B 的**不读取真实 Cookie 的纯 UI 静态挂载试验**，与 A 的代码量、产物大小和发布模型进行实测。通过安全、体积、数据/行为一致性门槛后，再决定是否转为 Trusted UI；否则仍保留现有正式 Sandbox 工具，不开展强制切换。不能同时长期维护两套不同的 Cookie 产品 JSX / 业务来源。

**特别注意**：所谓“可信 UI 可以免 iframe”仅适用于**代码来源已审计、随扩展静态构建并经过固定准入**。UI 组件只是显示层并不构成沙箱；进入特权扩展页的 React 事件处理器技术上可能触达扩展权限，因此不能因自己开发、组件共用、用 CSS 前缀或传入配置字段 \`trusted:true\` 而提升动态 JS。共享 DOM 减少的是样式/组件重复，不是无需考虑恶意代码。

## 4. 真实开发代码应该长什么样

### 4.1 只保留一个可维护的 Cookie JSX View（**以下为设计示例，文件和命令接口尚不存在**）

建议未来将已确认 \`preview/react/src/App.jsx\` 的呈现部分抽为独立纯 UI 组件，例如 \`examples/sidebar-tools/cookie-editor/ui/CookieEditorView.jsx\`，继续复用原目录已确认的交互与布局，不建第四套 UI。其依赖的命令通过 props 提供：

\`\`\`jsx
// 建议的未来文件；仅展示组件使用方式，不是现在可运行的实现。
import React from 'react';
import {Button, IconButton} from '../../../../src/ui/react/components/ui/button.tsx';

// snapshot、actions 是未来需要定义并审计的纯 UI 协议。
// 业务与权限由适配器处理。绝不在 UI 里调用 chrome.cookies。
export function CookieEditorView({snapshot, actions}) {
  return <section aria-label="Cookie Editor">
    <header>
      <strong>Cookie ({snapshot.count})</strong>
      <IconButton label="导入 Cookie" onClick={actions.openImport}>
        <span aria-hidden="true">⇩</span>
      </IconButton>
      <IconButton label="导出 Cookie" onClick={actions.openExport}>
        <span aria-hidden="true">⇧</span>
      </IconButton>
    </header>
    {/* 仍须使用原有列表、原位编辑与单次导入/导出交互；此处省略 */}
  </section>;
}
\`\`\`

这比自己在每个工具里重复写带 \`aria-label\`、title、边框/hover/focus 样式的按钮更简单，但**示例仅说明调用形式**，并未完成 Cookie Editor 的真实 JSX 迁移。图标实现、菜单/Field 等共用件必须在确有两个消费者、样式未改变时逐个增加，不复制一套大而全的 UI 库。

### 4.2 Trusted UI 接入（**概念示例，不是现有 API**）

\`\`\`jsx
// 仅说明组件关系。实际必须接入已存在的 src/ui/react/main.tsx
// 单一 Root，且先通过受审计的固定工具身份/来源/版本/撤权检查。
import {createPortal} from 'react-dom';
import {CookieEditorView} from '[reviewed-static-cookie-view]';

function RenderTrustedCookieArea({container, snapshot, actions, admitted}) {
  return admitted && container
    ? createPortal(<CookieEditorView snapshot={snapshot} actions={actions}/>, container)
    : null;
}
\`\`\`

真实代码不得通过动态 import、\`innerHTML\`、安装包里的 JS 源码或安装包 ID 声明实现这个挂载。优先参考已有 \`src/time-review/trusted-admission.js\` 的固定产物身份、官方发行来源、精确哈希、版本与 epoch 失效；Cookie Editor **尚无**相同准入。已有 \`src/ui/trusted-cookie-workbench.js\` 为另一段受信 Cookie UI 代码，**不能据文件名宣称其等于完整 Cookie Editor 或已完成 React 迁移**。

### 4.3 Sandbox 路径（作为安全保留）

相同 \`CookieEditorView\` 可在受限独立 iframe 内 \`createRoot\` 并接真实 \`OpenDeskSDK.browser.*\` 适配器。但这种模式仍须将 React Runtime、UI、SDK 适配器编译到规范工具包，处理独立 CSS scope、预算和完全相同的业务/权限/数据回归。**共享 JSX 源码并不自动实现运行时 React 去重。**

### 4.4 共享后究竟简化多少？

当前可以**确定的数字**是：组件共享 \`0\`，候选复用位置包括 9 个 \`IconButton\`、8 个 \`Field\` 和部分 20 个普通按钮。删除多少源行、CSS 颜色文字、减掉多少 KB，目前均为 **NOT_MEASURED**，不能凭空承诺整体减少 50% 或 80%。

可预期的优势按证据边界分开：
1. **维护**：修改经过两端确认的 IconButton 焦点、间距、ARIA，只需改一份公共组件；Cookie 特有布局不必跟着改。
2. **一致性**：设计 Tokens 不再在 Cookie CSS 手工粘贴十多个相同变量，深色/浅色改动自动统一；需验证旧视觉不漂移。
3. **执行**：路线 B 有机会复用已载入的宿主 React/ReactDOM，而路线 A 只能复用编译时的组件源码。
4. **成本**：路线 B 失去“改一个 JSON 就更新 UI”的独立部署优势；增强了固定扩展审核、用户身份和集成验收成本，并不能从简化按钮推导出权限实现更简单。

量化时提交独立报表：\`reused React component imports (count)\`、\`eliminated duplicated UI definitions\`、\`CSS hardcoded color occurrences before/after\`、\`Cookie business code line diff\`、\`React/Vite per-tool bundle bytes\`、\`WXT fixed entry delta bytes\`、\`canonical installed JSON bytes\` 和真实运行时差异。业务迁移变化与设计组件去重分开计算；不要把移动文件、删除业务或 gzip 压缩当作复用节省。

## 5. 编译、预览与发布方式（明确答案）

- **JSX/TSX 正式运行通常需要编译**，但开发者不应每次手动编译：接入现有 Vite/WXT dev/watch 保存自动构建；用户只打开浏览器，不装 Node。
- 独立离线 \`preview/react/index.html\` 是已经编译并内嵌 CSS/JS 的文件，\`file://\` 打开不需要当场编译、CDN 或扩展。它**只含模拟数据**，不能作为正式可信界面执行 Cookie 操作。
- 路线 A 每次工具 UI 发布：Vite 预编译 → \`scripts/build-sidebar-tool.mjs\` 官方候选 → 测试 → \`--promote-from\` → \`--check-project\`；单 JS/JSON 上限均必须满足。
- 路线 B 更新静态可信 UI 时须更新 OpenDesk 浏览器固定构建，经原 WXT 构建、CSP/入口预算、可信代码审阅和安装/撤权验证；不能以构建 \`cookie-editor.opendesk-tool.json\` 代替浏览器扩展升级。
- **当前无法宣布路线 B 已能在 Mac Chrome 运行，或能够节省指定 KB；两条路线均有尚未验证的正式 React 迁移门槛。**

## 6. 产品与安全保护（两种路线均必须满足）

- 当前正式 2.0.23 已有 Cookie Store/PartitionKey 精确身份、合法网站范围、写入/删除、原生值授权、导入导出、清理、观察、离线工作区与未知写入结果保护。**不能把 React Preview 的模拟 CRUD / mock grant / 随机 sleep 迁入正式业务**。
- 最新用户要求：**导入文件/文本自动解析 -> 一次点击执行导入，不要额外预览页或重复“确认导入”**；复制/下载一次点击完成。不能重复多次人为确认；真实 Host/Chrome 必需的权限审批、危险不可逆操作的安全确认仍保留。参照实际最新 JSX（当前源码标注 R4.11）核对，不能只参考 R4.9 的过时 README。
- 现有紧凑列表、380px 审核面板、导入/导出/新建图标位置、左右字段布局、语义 dirty、授权成功后隐藏引导、失败后保留输入和安全错误回执均保留。未提及的 UI 不重画。
- Value 默认遮蔽、最短保留；撤权/切换网页/更新/卸载/epoch 改变时清理值和异步回调，严禁传入持久日志、测试截图或普通全局状态。受信 UI 要比沙箱更严格检查扩展级权限泄漏。
- 禁止新增“管理员模式跳过权限”、\`trusted:true\`、新的通用 JSON UI DSL、第二 React Root、第二套 Host/Broker、强制把其它用户工具转成 React。
- 工具 ID 与已有用户安装、升级和数据保留必须审计；非正式/不同哈希同名包继续按原沙箱或安全拒绝，不执行其 JS 于宿主。
- 上游 R33 React 主侧边栏目前仍在并行修改；写入前核对最新 main 和同文件 writer，**不要为了 Cookie UI 重写其它 Tab、Host/SDK 或公共样式**。

## 7. 有证据的最小验证与路线裁决

优先做可撤回、不触及 Cookie 值的**纯 UI Trusted 技术试验**：
1. **R0 源码基线**：确认 JSX R4.11 与生成的 \`preview/react/index.html\` 是否通过原 \`npm run check\`，保留视觉基线；不把标题版本差异直接当作 hash 校验失败。记录两个构建输入 SHA。
2. **R1 UI 复用**：仅用 Button/IconButton + Tokens 在可信 React Root 的受控区域展示虚构 Cookie 元数据，验证不创建第二 Root、无 iframe、卸载后无残留、标签切换/键盘/焦点；编译时 import 的实际路径和两端构建边界必须 PASS。
3. **R2 可信准入**：核对来源、签名/包摘要、精确版本、用户安装与启停、撤权 epoch、同名伪装，非批准来源不得直渲；直接借鉴 Time Review 已有机制但不复制第二套准入系统。
4. **R3 官方功能**：接已存在受审计的 Cookie Host/SDK，覆盖真实读/写/删、Value、Store/Partition、导入单次提交/回读、导出复制/下载、未知结果与隐私隔离；失败不自动重试。业务不因改 UI 删除。
5. **R4 体积/UX**：分别测 R33 固定扩展构建增量、Cookie Tool JSON 预算、预览文件、320/360/380/420/520px、缩放、浅深色、ARIA；明确哪条路线实际省包、哪条更适合独立升级。
6. **R5 交付**：只有上列条件全过，且允许静态 UI 必须随扩展升级的发行策略，才决定路线 B 和正式发布；否则保持 A 的安全边界和现有已安装正式版本，先解决 A 的主 JS 超预算再迁移。

**证据标签**：\`SOURCE_AUDITED\` = 当前文件阅读；\`PROPOSAL\` = 理论可行路径；\`BUILD_PASS\` / \`CHROMIUM_PASS\` / \`MAC_INSTALLED_PASS\` 均需对应真实命令、同一个候选 SHA 和产物；没有运行或回执写 \`NOT_TESTED\`；明确失败写 \`FAIL\`；无合法权限/预算时写 \`BLOCKED\`。

## 8. 独立视角评分与反方审查

上一版单一 Sandbox 迁移建议的**设计自评为 84/100**（漏评 Trusted 选择和实际复用计数）；并非真实专家组现场独立评分。

本方案的**文档/架构静态评审目标 ≥95**，但不等于已实现 95+：产品清晰度、可信代码来源、安全边界、真正复用的测量、维护成本、编译/预算、业务完备、安装升级、可访问性和真实证据均必须**分别**评价。若任一项没有同候选实际证据，该项标 \`NOT_TESTED\`，**不得为了“总分 95”用平均值掩盖失败或未测**。

反方检查点：直渲增加高权限页面受信代码的审计表面、固定升级可能降低用户独立工具迭代速度、共享按钮不等于统一业务代码、构建产物可能不去重、全局 CSS 仍可互相影响、单根 React 的事件与异步状态冲突、已安装工具从动态到静态的准入/版本兼容，以及带值 Cookie 的日志或备份泄露风险。

**截至本文创建：DOC_CREATED；路线 B Cookie Editor 专项技术试验、正式源码迁移、Chrome 原生 Cookie 验证：NOT_TESTED。**