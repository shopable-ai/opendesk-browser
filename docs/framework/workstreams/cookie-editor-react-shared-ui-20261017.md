# Cookie Editor React 19 + OpenDesk UI 组件同源迁移 · 2026-10-17

## 状态与所有权

状态：`SOURCE_AUDITED / ARCHITECTURE_CONTRACT_ONLY`。本记录只写设计与实施边界，**没有迁移正式工具、运行构建、更新正式包或完成 Chrome 原生验收**。本阶段不修改并行 R33 React Sidebar、Browser SDK、Host、Cookie 业务、旧工具或用户数据。后续遵守 `AGENTS.md`：只在 `main` 安全编辑，避免覆盖并行工作，不建分支、worktree、PR，不强推。

- 正式 Cookie Editor：`examples/sidebar-tools/cookie-editor/tool.config.json`，`opendesk.sidebar-tool.v2`，`id=cookie-editor`，核查版本 `2.0.23`；发行输入仍为 `src/index.html`、`src/style.css`、`src/main.js`，独立安装包 `cookie-editor.opendesk-tool.json`。
- 已确认 React 19 预览：`preview/react/src/App.jsx` + `style.css`，构建到 `preview/react/index.html`；R4.9.2 为已批准的基础视觉与交互，后续 R4.10.x 细化图标、380px 面板和首次授权自动隐藏。预览只有虚构 Cookie、模拟错误与授权，不具备正式 Host 业务。
- 可信宿主 React：`src/ui/react/main.tsx` 为主 UI 的唯一 React Root；`src/ui/react/components/ui/button.tsx` 目前实际有 `Button` 和 `IconButton`，并非已完成 shadcn/React Aria 组件库。
- 视觉权威：`src/ui/design-tokens.css`、`src/ui/design-system.css`。正式工具打包器已有 `scripts/preview/shared-tool-design.mjs` 的受控视觉规则提取，只有显式标记、满足样式范围规则时才能接入；不能直接把宿主整份样式运行时注入沙箱。
- 安全/React 权威：`docs/architecture/react-ui-shared-components-r33.zh-CN.md`、`docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md`。现存 Cookie 导入故障/真实回执继续参考 `docs/framework/workstreams/cookie-import-*-20261017.md`，不能因 UI 改版回退 2.0.23 的正式导入修复。

## 核心决定：源代码复用，绝不跨沙箱共享执行权限

```text
可信 Side Panel（src/ui/react/ 单 Root）
   └── 现有 Sidebar Tool Host / Installer / SDK 权限通道
         └── opaque-origin sandbox iframe：cookie-editor（自己的 React Root）
                 ├── CookieEditorApp / UI primitives（构建时复用共用 UI 源码与 Tokens）
                 ├── CookieController（只管状态与操作结果）
                 └── CookieSDKAdapter（原有公开 OpenDeskSDK.browser.* 与 OpenDeskTool.request）
                        └── 原有已审计可信 Host -> Chrome Cookies
```

共享的是**纯展示组件源码、Tokens、无权限的格式化工具和可审计构建约定**，而不是宿主 DOM、React Root、React Context、特权事件、`chrome.*` 或当前敏感 Cookie 值。运行时不得使用 CDN、跨 iframe 取宿主 React 全局、注入动态工具 JS 到可信 Side Panel，也不得建第二套 Broker/Host/Installer。

当前公共源码位置 `src/ui/react/components/ui/` 保持 R33.3 的唯一归属；Cookie Tool 可在预编译时消费经过审核的纯 UI 组件源码。若共用 Button/IconButton 的样式或构建能力不足，先补**真实两端使用**的最小能力，不为 Cookie 私有需求污染平台，也不要复制长期并存的另一套“共享”组件仓库。其余 Cookie 列表行、Inline Editor、导入/导出和授权文案为 Cookie 专用组件。

## 实施顺序与唯一 UI 来源

1. **先复核最新 main/并行状态**。核对正式 2.0.23 的 SDK 业务和测试、R4.9.2 用户确认的 UI；明确所有保留功能，不因预览少了旧入口而删掉正式行为。
2. **确立一个可维护 JSX 源**。把已批准 `preview/react/src/App.jsx` 中的真正界面抽成 Cookie Editor 独立项目中的 UI 组件；将 demoSite、虚构列表、场景选择器、sleep/随机结果、模拟授权和 demo-only 解析器全部隔离到 preview adapter/实验台。正式入口与离线预览均消费同一 Cookie UI 组件，而非各维护一份 JSX、静态 HTML 或 CSS。生成产物不是第二份可编辑源码。
3. **构建接口只包含 Cookie 领域能力**：当前网站/自定义目标与权限快照、Cookie 元数据列表、显式敏感值读取、按完整身份保存和删除、导入解析/预检/执行/结果核验、导出复制/下载、观察变化、精确清理、已有离线工作区。实现 preview adapter 与真实 SDK adapter；不要用模拟结果更新真实业务状态。
4. **React 独占工具内 UI DOM**：旧 `src/main.js` 同一 DOM 的 querySelector/render/addEventListener 不能与 React 对同一区域双重管理。先抽取可复用的纯解析、规范化、权限/安全业务和异步代次逻辑；React 只处理渲染、草稿、焦点与命令派发。必要时阶段性保留未迁移、不同 DOM 区域的旧业务，但不能发布一套隐藏在 React 下重复运行的旧 UI。
5. **共用组件**：优先接入已存在 `src/ui/react/components/ui/button.tsx` 的 Button/IconButton 和官方 Tokens；只在真实需要且被两端消费时扩展 Field、Switch、Menu、Message 等纯 UI 原语。先比较 CSS scope、键盘/ARIA、包体积；shadcn/React Aria 属待验证候选，不得虚报已经集成。
6. **离线及正式同源构建**：保留现有 Vite + React 19，官方 `src/main.js`/`src/style.css` 是从 JSX/CSS 预编译的静态产物，由原 `tool.config.json` 和 `scripts/build-sidebar-tool.mjs` 打包；`preview/react/index.html` 继续是直接双击可见的单文件离线产物。提供 build/check/watch，避免用户每次手工复制产物；更新任一 UI 源必须令两种产物与签名来源一致。
7. **发布必须守住配额**：核查时 React 预览内联 JS 的 base64 解码后约 `224756` 字节，已经超过 `scripts/build-sidebar-tool.mjs` 的主 JS `220000` 字节上限；完整 JSON 还有 `320000` 字节预算。不得把旧 80KB 业务直接附加到 React bundle、直接提升配额、换成 CDN 或关闭 CSP。先移除仅预览代码并优化产物；仍不满足时审慎评估 packer 已支持的本地固定 classic script dependencies（每个上限、总包上限和沙箱校验同时验证），无可证明方案标记 `BLOCKED` 并保留当前安装包，不能冒称 React 已发布。
8. **先验证再提升安装包**：正式版本从真实当前版本安全递增（若无其他并行版本更新可考虑 `2.0.24`），唯一 `cookie-editor.opendesk-tool.json` 必须由原打包器的候选 -> 定向测试 -> `--promote-from` -> `--check-project` 生成，不能手改安装 JSON 或用旧模拟结果判真实权限 PASS。

建议唯一 React 领域项目可逐步收敛为 `examples/sidebar-tools/cookie-editor/ui/`：`CookieEditorApp.jsx`、`components/`、`adapters/preview.mjs`、`adapters/browser-sdk.mjs`、`domain/`、`entries/{preview,official}.jsx`；命名按已存在实际文件调整，不创建重复的长期源码根。正式生成文件仍由原工具配置指向 `src/`。

## 迁移不得丢失的 P0 业务与 UX

- 原 R4.9.2/R4.10.x 已批准的紧凑列表、380px 主面板、顶部图标、行内新建/编辑、必要时的高级属性、语义 dirty/恢复、已授权时隐藏首次引导、简洁反馈与键盘焦点。不要整体重设计。
- 当前活动网站切换、合法自定义目标、网站读取权限/单独 Cookie 值授权、撤权、拒绝重试、Store/PartitionKey 完整身份、过期记录处理、禁止跨域 Cookie、禁止伪造授权和权限变化后敏感值清除。
- 正式 UI 已有的离线工作区、搜索/筛选、批量清理/预检、元数据观察、JSON/Header/Netscape 导入/导出、复制文本/下载文件。旧正式功能不可因预览未画出而静默删除，若要改变产品范围必须先单独审查。
- 2.0.23 导入修复：多条输入、过期处理、预检可恢复、`setMany` 可用时使用、旧沙箱缺 `setMany` 时按已有 `set` 安全回退、精确回读、原始输入保留、失败阶段安全错误码、未知结果**不自动重试**。
- 私密 Value 不进入预览样本、持久日志、工具测试快照、DOM 长期隐藏副本或不必要的 React state；仅正式用户触发的受控读取才在有限生命周期内可见，网站切换/权限撤回/页面离开/并发 epoch 过期必须及时清除。
- 复制只进行真正必要的敏感内容确认，不重复弹窗；成功必须来自真实剪贴板/下载回执。不能用模拟授权、模拟导入成功来替代 Host 结果。

## 最小可交付及证据等级

- A：共享组件和双入口 UI/Token 同源，源码/离线 React 预览构建与静态校验，`SOURCE_WIRED` / `BUILD_PASS` 分开记录。
- B：实际 Browser SDK 适配器，CRUD、授权、导入导出、Store/Partition/epoch/未知结果等定向 Node 测试，`COMPONENT_TESTED` 或 FAIL。
- C：Vite 正式主 JS/所有脚本/JSON 配额与 CSP 检查，既有唯一 packer 构建候选、核验同源后晋升，记录版本、工具包 SHA、CI URL。
- D：真实 Chromium 320/360/380/420/520px、深浅色、150/200% 缩放、键盘、交互和生命周期；真实 Mac 已安装 Chrome Cookie Host/权限/导入/导出需另行原生证据，不能从预览 PASS 推断。
- 未跑之项均标 `NOT_TESTED`，版本/包晋升之前旧可安装版保持可用。各维独立评分目标 95+，未测不能以主观分数顶替验收。

本记录的作用是帮助同步**正在并行推进的可信 Side Panel React**与**可安装 Cookie Tool React**，不更改前者的组件所有权、安全合同或正在使用的正式 Cookie 业务。