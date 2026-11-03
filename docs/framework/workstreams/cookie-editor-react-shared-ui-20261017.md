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

## 2026-10-31 增量：SW 展示职责拆分

> 当前状态更正：本节前期的原生 owner/blocked/八项均未测属于记录时事实；已收到并核实同日 `e002aa308` 的后续原生证据。原安装更新已通过，旧 owner Goal 实读 paused，新产品 owner 为 `01a191d5-511b-7330-9643-f4aa4d5f4891`。见本节末尾更正；这些结果不提升本次 SW 拆分候选为 Chrome PASS。

当前阶段：核心源码拆分和最小验证；负责人为本任务，原生账号/S3任务仍归 `01a19164-c087-76d1-a47f-b1a90732d898`。不创建 Goal、分支、worktree、PR，不推送。

下一条产品操作是企业页读取连接状态。原生入口由原 owner 持有，未取得本候选 Chrome 证据；本轮将 SW 中的安装/连接事实与展示合成分离，保持账号、Native 和分享功能。

写入范围：Cookie 的 `trusted/service-connections.js`、`trusted/service-session.js`、新 `trusted/service-view.js`、相关项目测试与 README；`src/ui/sidebar-tools.js` 的原 Cookie 返回适配；`scripts/bundle-provenance.mjs` 与对应来源测试的精确 pin/目标；原宿主解耦文档第9节。已一次通知原 owner。内部事实 DTO 仅用于原 SW→可信 Host；App 继续接收原字段。无存储 schema、权限、安装包或公开 SDK 变更。

资源：仅 Node/临时目录，不占 Chrome、Native、端口或 dist，不启停 writer；保留历史 unknown 刷新围栏。原 writer 可能自动观察源码，精确来源门禁继续拒绝未经审查的中间字节；本任务不触发刷新。

验证范围：事实脱敏与展示投影，原配置/会话的版本、身份、撤权、未知写入和重连行为，Node 实际业务适配器，固定入口来源/目标。完整 Browser 构建、serve 发布及真实 Chrome 均 NOT_TESTED。本文件只记录本轮执行，不代替原产品需求或原生账本。

### 本轮实施与验证

`service-connections.js` 仅生成安装身份、断开和本站账号版本事实；`service-session.js` 仅生成脱敏的租约/代际/可恢复性/绑定/pending事实，在可信侧就过滤无效会话的资源与策略。原事务、存储 schema、远端写入及 unknown 保护未移走。`service-view.js` 是纯 UI 投影，在原 Host 的 Cookie 响应处调用，保留旧 App 返回字段。没有改 App/正式 JSON、公开 SDK、账号/分享核心或后台注册。

- 两条事实 DTO 回归先以旧实现运行，均因缺少事实 DTO 而失败；实施后通过。
- `node --test examples/sidebar-tools/cookie-editor/tests/service-connections.test.mjs examples/sidebar-tools/cookie-editor/tests/service-session.test.mjs examples/sidebar-tools/cookie-editor/tests/service-connections-host.test.mjs examples/sidebar-tools/cookie-editor/tests/service-session-integration.test.mjs examples/sidebar-tools/cookie-editor/tests/service-connections-ui.test.mjs`：最终96 PASS / 0 FAIL。首次92 PASS / 1 FAIL为旧fixture断言读取已移出SW的capabilities字段；改为断言原外部结果，产品代码未为该断言放宽。新增真实Host路径测试的fixture先后漏传taskWorkbench及误用data/result字段，两处均仅修fixture；真实Host→App兼容及内部事实不外传检查已通过。
- `node --test --test-name-pattern '^Cookie session Host forwards only reviewed metadata and its captured document$' tests/environment/sidebar-tools-host.test.mjs`：1 PASS；复用该既有测试，未修改其并行diff，确认非service的分享路径不受转换影响。
- `node --test tests/environment/cookie-account-provenance-r134.test.mjs`：10 PASS / 0 FAIL。对应两份SW源码精确重新锁定；展示模块只准进入原Sidebar Host。保留前任务recordBundle守卫及回归，不放宽目录、动态代码、目标或symlink合同。
- esbuild `write:false, bundle:true, minify:true` 独立编译账号服务闭包；before通过仅对两份变更服务的onLoad读取当前HEAD原文件，after读取工作区。284771 → 283620 B（-1151 B）；展示模块2084 B，唯一输入为自身，不在账号闭包中。这是Cookie组件，不是完整SW/WXT构建。

没有移除既有Vault/分享/Native静态依赖；减少的是两处展示判断。当前仍随Browser发布，独立App/后台升级未实现。源码主观复评74/100（前任务约70），不是独立专家评分，证据等级分开报告。原owner已确认无重叠未提交源码；本任务不接管其blocked Goal或八项NOT_TESTED原生结果。

资源 released：本轮Node与临时目录已退出；未启停writer、手动写dist、安装/重载Chrome、操作Native、提交或推送。后续产品验证须由原owner在合法入口及unknown刷新围栏允许时进行，不自动开启旧完整验收。

语法检查和本轮diff检查通过。执行记录归并本文件，未保留新增架构账本。新增相对链接均存在；README与旧宿主审计中历史CSDN/发行记录/迁移前AdBlock、Stay Focus链接有既存缺失，确认HEAD原文即已存在后延期，未扩成本轮清理。

### 接续审查：服务操作与账号仓库的实际依赖

2026-10-31，当前任务接手上述源码写入范围；实读 `main...origin/main [ahead 3]`，HEAD `3f7d38c14`，本任务 `get_goal=null`，不创建 Goal。原生/S3 owner 和 blocked 状态不变。原 `src/native-agent/transport.js → service-worker.js → managed-service-client.js` 只在固定 SW 创建并持有 Port 客户端，未发现可信 UI 可直接复用的同等连接与持久账本入口；暂不迁移 Native 编排，不另建通道。

IN_PROGRESS：下一条操作为「尚无本站账号关联 → 添加本机服务 → 手动连接/读取资源/打开管理页」。`account-service.js` 当前在任何 service 操作前调用 `statusFor(origin)`，因此会受无关 Cookie 仓库损坏影响。新增最小回归先定位这条依赖；拟仅在创建关联或返回已有本站关联前读取账号版本。关联授权、原 Native 租约/账本、全局串行清理、unknown、来源 pin 和原消息/存储合同保持。

新增写入 `trusted/account-service.js` 及其精确来源 pin；扩展原项目 Host/集成测试，README/本记录更新。只占用 Node 与各测试自行分配的临时目录/loopback 管理 HTTP，不占 Chrome、Native、dist 或固定端口，不启停 writer。已有96项/来源10项作为历史证据保留；因账号分发输入变化，仅重测服务 Host/集成链与精确来源，不重跑纯展示/配置/会话模块未变的单元组或产品构建。

结果：上述 `IN_PROGRESS` 已结束，资源 released。修复仅调整 service 分支内依赖顺序：先取本站连接/关联事实，只有 `serviceAssociate` 或存在本站关联时再读 `statusFor(origin)`；随后仍执行 `assertCurrent()`。`serviceSession` 最终事实继续从真实账号核对 `accountCurrent`；Native dispatch 不信任显示状态。其他账号、分享和自动导航分支未改，无消息/存储 schema、公开 API、App、正式 JSON、权限或 Native 通道变化。企业页源码确认 `serviceStatus` 与账号 `status` 分开请求，配置按钮不依赖 `accountReady`；仅关联草稿依赖它。没有真实 Chrome 操作证据，不能提升为原生可用。

验证命令与结果（Node v24.15.0）：

- `node --test --test-name-pattern 'Cookie account store' examples/sidebar-tools/cookie-editor/tests/service-connections-host.test.mjs examples/sidebar-tools/cookie-editor/tests/service-session-integration.test.mjs`：改实现前2 PASS / 2 FAIL；两条连接正例均在 `account-vault.js → checkRecord/load` 报 `E_VAULT_CORRUPT`，负例通过。最小修复后4 PASS / 0 FAIL。未改测试预期适配实现。
- `node --test examples/sidebar-tools/cookie-editor/tests/service-connections-host.test.mjs examples/sidebar-tools/cookie-editor/tests/service-session-integration.test.mjs`：15 PASS / 0 FAIL，含配置/关联、原 Host→App 事实兼容、真实 Node 资源与管理 HTTP、无账号仓库时的连接/资源/策略/管理/远端断开链，以及账号仓库损坏时关联仍拒绝、安装/Document/撤权、未知绑定原回执和重连版本围栏。
- `node --test tests/environment/cookie-account-provenance-r134.test.mjs`：10 PASS / 0 FAIL。`account-service.js` 审查后精确 pin 从 `fcd7fab18b0bac62fe4a105569523c0c6011d1cb` 更新到 `944308bfcdc4fa5db302c0935b405ee7e488129b`。前任务 `recordBundle` 的无 evidence 目录守卫、新展示目标限制及其测试均保留。
- `node --check examples/sidebar-tools/cookie-editor/trusted/account-service.js` 与本轮文件 `git diff --check` 通过。没有执行完整构建或改写 dist。

剩余优先级和执行边界维护在项目 README「继续审查」表：Native 手动编排可信但不天然必须 SW，当前没有可直接复用的可信 UI 等价传输/账本；邀请普通流程与草稿已在 App，不能重复迁移；固定展示投影收益有限，不继续叠加包装或评分。后台独立升级及完全公共替代仍未实现/`SDK_GAP_NOT_PROVEN`。Chrome/Native、当前 writer/serve 连接状态均未知/NOT_TESTED，不接管原生 owner 的 blocked Goal；本任务 Goal 实读 null，未创建/提交/推送。

本次通过后的关键输入 SHA-256（用于后续影响判断，不是完整 Browser 候选指纹）：

```text
6c6b2a131f0148f83318b2c3bf629ed1cb1c95f249c579bd92097be2b9845537  trusted/account-service.js
24df9cbd744e497275374e41293b6fc68673a0f9a099abdb73ebaad5f6d82221  tests/service-connections-host.test.mjs
6fd5c4666852a4b7e24341de3f394be6cc974f01b180f8c202a2c2e2bbccbea1  tests/service-session-integration.test.mjs
d2ac78c6f9386d81fce79a26b900758d1e46d21b3121e496f794b938d600e4a8  scripts/bundle-provenance.mjs
de78e056f6ca0a4bc5c98998e5b34a19707483e18cef2a3fc93ebad125155455  tests/environment/cookie-account-provenance-r134.test.mjs
```

前三项相对 Cookie 项目，其余相对仓库根；包含继承的未提交拆分，不可只按 HEAD 复用。后续正常产品操作仍是合法入口下核对企业页服务连接；Chrome/Native 资源继续由原 owner 管理，本轮无独立原生待办，不通过刷新或重装绕过历史 unknown。

### 原生状态更正与所有权（2026-10-31）

只读核实 `e002aa308` 的 `evidence/r31-s3-finish-20261030.json → s3FinishNativeEntry20261031.resume01a19164.nativeControlExecution20261031`、原始 `artifacts/cookie-editor-r31/native-control-01a19164/progress.json`、Goal 和 owner 交接回执。旧 owner `01a19164` Goal 原始回执为 paused（SHA-256 `5b795f1db4f5c35a70798f0a48116aac478bf3a3d223db051bcfbf6d5805b88e`），新产品/原生 owner 为 `01a191d5-511b-7330-9643-f4aa4d5f4891`，local/main；未完成或自动迁移旧目标。原生 owner 另维护唯一 S3 evidence JSON 和原 `cookie-editor-r31-s3-finish-20261030.md`，本任务不写这两份文件。

原工具栏→SidePanel→原审阅2.0.56→2.0.57及官方来源/完整包 SHA 已独立确认；原 A/B/test1 和白名单/自动切换/刷新已读回，B 的虚构值仅只读核对。指定候选的 UI revision 为 `ad9bed4dc7893a7d3aaeddeb7692c7f65b24cf5e12d4f81cf30e73ac89d8105c`、ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`，实际 UI 连接与当时磁盘比对有证据；AX JSON SHA-256 `a8fef410e8671ef38720194bab2df503e74a3a79df33f52495f4c1e9b90d749b`，安装详情截图 SHA-256 `94635776ecc89c73e3c99e811fec76c6c4a4433516a7e27d626146066defb403`。实际物理加载路径、A 值、闭侧栏双向切换/刷新、双机/恢复/登录仍未测；不能以该原候选证据提升 `b9c058fca` 的 SW 拆分为 Chrome PASS。

README 已顶置上述当前入口，将旧 blocked/待安装段落标为历史。仅改 README 与本记录，检查证据字段/摘要、链接和 diff，不跑产品测试/构建、不占输入/Chrome/Native/服务/dist，不启停 writer或清 unknown。共享输入已释放给 Scrapy，新 owner 不自动继承。新收到的 Sharing/Accounts/preview/react.css 等 dirty 不是本任务变更、具体 owner 未知，已一次告知新原生 owner 保留；不覆盖或随本次文档保存。

### 接续修复：账号损坏不阻断既有远端撤权（2026-10-31）

> 本小节为上一轮执行记录。下述“重入未实现”已由下一小节的后续修复覆盖；原命令和摘要保留对应当时输入。

本架构接续实读 HEAD `07ab1034c`、`main...origin/main`，索引空，`get_goal=null`；未创建或修改 Goal。仍是核心源码修复及最小验证。组合式 Cookie App 的唯一 owner 为 `examples/sidebar-tools/cookie-editor/`：本次修改固定 SW 账号适配器，复用原 Host→Native 消费者→Node 业务服务，不改公开 `browser.cookies.*`，不新增公共能力或框架通道。现有 Tool v2/React 包 `2.0.57` 不含本次可信代码，未重新打包。后台独立升级及完全公共替代仍未实现/`SDK_GAP_NOT_PROVEN`。

实际入口取证：`app/components/CookieServiceConnections.jsx → CookieEditorApp.jsx.serviceAction → accountRequest →` 原固定 Host 的 `cookieAccount` 分发。已载入的企业页解绑/断开不依赖 `accountReady`，直接发送用户审阅的服务/会话 revision；创建绑定才读取当前账号。缺陷在 `account-service.js`：只要本站有任何关联，四种撤权/清理操作也先调用 `statusFor(origin)`，损坏账号因此以 `E_VAULT_CORRUPT` 阻止原服务账本中的精确解绑和断开。

最小修复仅在 `serviceUnbindAssociation`、`serviceRemoteDisconnect`、`serviceDisconnect`、`serviceRemoveAssociation` 读取账号且明确报 `E_VAULT_CORRUPT` 时，保留空的已核实账号集合并继续；输出关联为 `STALE`，不伪造当前账号。健康账号仍按原路径核对。存储不可用、迁移冲突与 `E_OUTCOME_UNKNOWN` 不被吞掉；普通状态/改名、新关联、远端绑定、管理页和策略批准仍拒绝损坏账号。原安装/Sender/Host Document、配置/会话 revision、连接 epoch、Native 活租约、绑定 ID/版本、authEpoch、持久回执与 unknown 禁重放均保留；本地清理仍先通过原远端活动围栏。未更改消息或存储 schema、SW 注册、公开 SDK、Native 通道、App 或正式 JSON。

验证与证据（Node v24.15.0）：

- `node --test --test-name-pattern 'corrupt Cookie account store|Cookie account store is corrupt' examples/sidebar-tools/cookie-editor/tests/service-session-integration.test.mjs`：修复前4 FAIL，解绑和远端断开直接报 `E_VAULT_CORRUPT`；修复后4 PASS。新增行为覆盖真实 Node 绑定撤销、确认后本地移除、远端仍活跃时禁止直接清理、未知绑定不重放，以及损坏账号不能获取绑定/管理/策略权限。
- `node --test examples/sidebar-tools/cookie-editor/tests/service-connections-host.test.mjs examples/sidebar-tools/cookie-editor/tests/service-session-integration.test.mjs`：19 PASS / 0 FAIL。包含原真实 Host→App 返回形状、安装/Sender/手势、文档及站点撤权、重连版本、原操作对账和真实 Node 管理 HTTP 链；Chrome/Foundation/Native 传输仍为测试替身，不是原生验收。其后仅将新增撤权回归的末端断言改为核对远端设备确实撤销、管理访问关闭及本地 epoch 前进，复测上述四条仍 4 PASS；运行时源码未变。
- `node --test tests/environment/cookie-account-provenance-r134.test.mjs`：10 PASS / 0 FAIL。审查后仅将账号服务 Git blob pin `944308bfcdc4fa5db302c0935b405ee7e488129b` 更新为 `41807f91a610f0b44df81afc2e1b0d7d0d22bd7e`；固定 SW 目标、来源漂移/symlink、无 evidence 的 WXT hook 拒绝保护保持。该 hook 调用不是完整构建。
- 修改源码与集成测试的 `node --check` 通过；本轮文件的 diff/链接/摘要检查通过。未重跑未改输入的纯模型/UI 单元组、完整 Browser 构建或原生矩阵。

通过时关键输入 SHA-256：`trusted/account-service.js` 为 `b9a8d1c68163b3e6353df74d1d7b27cd621e4649a9f3c26eca32500c88cbc7a5`；项目 `tests/service-session-integration.test.mjs` 为 `0e544c0e5f95c7ff017113175bcafcbeef80ce221685bec76a88618d38776313`（含末次四条断言复测）；根 `scripts/bundle-provenance.mjs` 为 `afb0aea789ddf1b4e5dc3f6861a027d2b63187fcbd25ebac0f520c0ea36fce78`；根 `tests/environment/cookie-account-provenance-r134.test.mjs` 为 `838f977ad4aba5554435c492540419dd05f85e5c887aa56a82cccb2c57193f0b`。

限制与所有权：损坏后重新进入企业页仍会因 `serviceStatus` 拒绝而无法载入，不宣称该错误恢复已完成；本轮解决已载入状态下的精确撤权。完整构建、当前 serve 发布/连接、Chrome/Native 均 `NOT_TESTED`，没有新评分。只使用测试临时目录和系统分配的 loopback 端口，均已释放；未启停共享 writer、写 dist、刷新/重装、使用输入/剪贴板/Native、接管原生资源或清除 unknown。原生 owner 的 S3 证据/工作记录及并行 App/preview/Cloud/Scrapy 改动保留。此次六份修改留在本地 main，未暂存、提交或推送；下一条原生验证仍由产品 owner 按其资源窗口安排。

### 后续修复：重新进入服务页后仍可撤权（2026-10-31）

用户要求“看不明白，继续”。下一条操作收敛为：账号损坏后重新进入企业页 → 读回原连接/关联 → 明确解绑或断开。原生资源仍由产品 owner 持有，继续仅做源码和定向 Node 验证；`main`、原业务 owner、公开 SDK、运行世界和安装合同不变。

四条改进后的入口回归先复现 `serviceStatus → E_VAULT_CORRUPT`。修复只将原状态读取加入上一轮的已知损坏降级：真实连接与绑定仍取原可信存储，账号有效性一律不确认；不调用 Native、不修改账号或清除 pending。新绑定、管理页、策略批准、改名和其他错误仍按原路径拒绝。原 App 初始 `serviceStatus` 可接受原返回形状，失效账号的解绑按钮本来就不依赖 `accountReady`；因此无需编辑并行 App、编译 UI 或重打包。SW 重启/Native 失效仍受原活租约约束，不能把重入恢复当作会话重新授权。

最小验证：

- `node --test --test-name-pattern 'service status preserves|reopening service status|revocation with a corrupt' examples/sidebar-tools/cookie-editor/tests/service-connections-host.test.mjs examples/sidebar-tools/cookie-editor/tests/service-session-integration.test.mjs`：修复前4 FAIL、修复后4 PASS；包括重入后分别解绑/断开，以及读回未知绑定后仍禁止重放。
- 上述两个文件不筛选的回归：20 PASS / 0 FAIL。扩展原 Host 测试同时覆盖正常账号和损坏账号，真实 `createSidebarTools` 启动后可返回原 App 形状，内部授权事实仍不外传；原 Node 适配器独立读回实际远端绑定/设备撤销。
- `node --test --test-name-pattern '^stale active binding can unbind without a local account and confirmed revocation can be removed$' examples/sidebar-tools/cookie-editor/tests/service-connections-ui.test.mjs`：1 PASS；复用既有 JSX 按钮交互回归，无 UI 源码修改。
- `node --test tests/environment/cookie-account-provenance-r134.test.mjs`：10 PASS。审查后仅将账号服务精确 pin 更新为 `be7a41991904dbbd79d258567ac6a2bdf9a499ec`，未放宽目标/来源/动态代码准入。修改源码及两个服务测试的 `node --check` 通过，文档/摘要和定向 diff 检查通过。

本次输入 SHA-256：

```text
9eb16a7ad83b1eb7a187aa927522b28ac6f7d12f2b3aa4d1973dc002230d8b8d  trusted/account-service.js
ee30c3144fc3c54ad576b5bf9a6bc136431f159831e7b6ff1ccafe395aae3715  tests/service-connections-host.test.mjs
0f38c227f7e6ff3f284ca4ac1a6ddf44699e4bf7941d03215fb09683fe2ee414  tests/service-session-integration.test.mjs
8e1676b25371d810f4c73eb0d017a632ffde8602a01d2d007bc8ea2e8797a456  scripts/bundle-provenance.mjs
729b2bc8adb4cd4811bfd283189eb4ba0708218b1ab10d133fdd2275f30e5069  tests/environment/cookie-account-provenance-r134.test.mjs
```

前三项相对 Cookie 项目，后两项相对仓库根。当前共七份本任务修改留在本地 main，未暂存/提交/推送。完整 Browser 构建、serve 应用和 Chrome/Native 仍 `NOT_TESTED`；不接管共享输入、浏览器、Native、writer 或输出，临时 Node HTTP/目录均已释放。不自动扩展到后台独立升级、公共 SDK 或其他 Cookie/S3 验收。

### 接续提示词审阅与交接（2026-11-01）

用户要求提示词更易理解、保留原目标与关键任务、防止不同对话重复执行，并采用独立百分制评分及算术平均。当前核心源码改进已经完成，实际Browser/Chrome/Native验收及Git保存未完成，后台独立升级仍是未实现的后续方向。本回合只修订提示词；未运行产品测试/构建、未操作浏览器/Native/输入/服务。只读核对上述五份源码/测试/来源文件摘要仍与最后工程检查点一致，已有自动证据继续有效；`get_goal=null`，未创建或修改Goal。

唯一接续提示词为 [Cookie服务本地验证与收尾](../prompts/cookie-editor-service-boundary-continuation.zh-CN.md)。它与另一个双机/S3提示词分属不同任务；新任务先从本记录最新有效工程检查点及在途操作接续，不重做展示拆分、已修依赖和有效检查。原生资源按最新owner核实。本对话交付提示词后不再继续工程写入；这不自动移交浏览器/Native/writer，也不暂停、完成或迁移任何旧Goal。

本次提示词初稿SHA-256 `0ba3aa7bb8d4ac3259d9f10b4389aae5d45e8d5c7487355a7f5c55f5547ba76e`。两位独立AI审阅者在独立上下文、互不看到对方结论的情况下冷审；均未修改文件或运行工程。每位分别对目标与需求、语义可读性、任务与验收、跨对话去重、权限与证据给0–100分，个人综合为五维算术平均，总综合为两人综合算术平均。

| 初稿审阅者 | 目标与需求 | 语义可读性 | 任务与验收 | 跨对话去重 | 权限与证据 | 个人综合 |
| --- | --- | --- | --- | --- | --- | --- |
| AI A · Archimedes `01a192ea-a47e-7b40-b6d8-34ad59fdfcad` | 93 | 92 | 88 | 94 | 96 | 92.6 |
| AI B · Curie `01a192ea-a5c3-72a2-9572-a43eac6d25f5` | 95 | 96 | 88 | 91 | 88 | 91.6 |

初稿总综合 `(92.6 + 91.6) / 2 = 92.1/100`，未达95。按具体意见修订：用用户操作描述开头；明确原生夹具尚未核实、下一步先只读确认；将源码、隔离Profile及实际SW产物串成同一候选证据；分别定义正常、损坏账号下解绑/断开两例、未知结果禁重放的成功条件；缩小章节写入、核对真实资源owner；Git保存取决于明确授权且独立报告；只保留一套本轮完成标准，提示词评分与有当前授权才执行的产品评分分开。修订稿SHA-256 `8a4875c8029594cf348ec0e5d93bf88785a02ee4e6fc64d7eec9b8f017e4c1ed`，交两人分别复评，不要求保底。

| 第二稿审阅者 | 目标与需求 | 语义可读性 | 任务与验收 | 跨对话去重 | 权限与证据 | 个人综合 |
| --- | --- | --- | --- | --- | --- | --- |
| AI A · Archimedes | 98 | 96 | 95 | 99 | 97 | 97.0 |
| AI B · Curie | 98 | 97 | 94 | 98 | 97 | 96.8 |

第二稿总综合 `(97.0 + 96.8) / 2 = 96.9/100`；AI B的任务与验收维度仍94，未宣称所有维度达标。两人均指出未知结果步骤容易误要求UI显示内部ID、禁重试目标范围不够明确；AI A另建议明确Goal快照归属。最终稿仅修正这些歧义：UI提示未知，原账本独立核对ID/pending，不新增诊断UI；禁重放限定同一配置/会话/绑定及原未知请求，保留只读对账和其他独立操作；Goal状态明确属交接任务，接手者实读自身。最终稿SHA-256 `6920e3caa96b54820fa04b0ff06dc04dd703af8f7e09ade5f65c7272c24ce6a0`，再次分别复评。

| 最终稿审阅者 | 目标与需求 | 语义可读性 | 任务与验收 | 跨对话去重 | 权限与证据 | 个人综合 |
| --- | --- | --- | --- | --- | --- | --- |
| AI A · Archimedes | 100 | 98 | 99 | 100 | 100 | 99.4 |
| AI B · Curie | 99 | 98 | 98 | 99 | 98 | 98.4 |

两人均独立读回最终稿全文并核对上述SHA；未互看结论，也未修改文件或执行工程。最终总综合 `(99.4 + 98.4) / 2 = 98.9/100`，每维及个人综合均≥95。AI A保留技术段落密度和需从原协议定位动作的轻微扣分；两人均未发现必须继续修订的问题。分数只评价本份提示词，不证明产品、Chrome/Native或正式验收通过；产品当前未做独立评分，不能据此宣称产品达到95。

本回合只新增上述提示词并向本节追加审阅/交接记录。提示词路径、最终摘要、评分平均值及文档格式已核对，工程源码和原有并行改动未变；未暂存、提交或推送。后续执行以最新有效工程检查点及实际资源回执为准。

### 本地有限验收入口核对：新源码尚未应用，原生流程未测（2026-11-01）

本轮 owner 为 `01a192fa-84a8-7a31-9872-8f1ae7d2688a`，目标只含企业页正常重入、损坏账号下分别解绑/断开，以及原未知绑定的只读对账和禁止重放。**源码完成，验收未完成；当前不能确认用户已能在浏览器使用本轮修复。** 本轮没有复现新的产品故障，没有修改运行时源码、App、CSS、preview、Native 或正式工具包；没有扩展到独立后台升级、production 或双电脑分享。自身 `get_goal` 实读为 null，未创建或接管旧 Goal。

原始核对结果保存在本机 [entry-audit.json](../../../artifacts/cookie-editor-service-boundary-20261101-01a192fa/entry-audit.json)，可审查的七文件差异保存在同目录 `review.diff`。证据目录不提交为正式安装物。核对时 `main` HEAD 为 `07ab1034cc7b24f3de966bb437dd03c72a439a1a`；上个工程检查点列出的五份源码/测试/来源文件 SHA-256 全部一致。原 Host/实际 Node 链20项、原解绑按钮1项、来源保护10项继续有效，本轮未重跑；它们仍不证明真实 Chrome/Native。

**候选与实际应用链未建立：** 本轮意图是持续开发验证，期望复用 `/Users/mac/Documents/workspace/opendesk-browser/dist/development`，但当前只有遗留 development 产物，不能标为已连接 serve。43119/43120 均无监听；`.wxt/development.lock` 仍记旧 PID12811，实际进程不存在。本轮未清锁、启动或停止 writer。磁盘 `development-update.json` revision 为 `ad9bed4dc7893a7d3aaeddeb7692c7f65b24cf5e12d4f81cf30e73ac89d8105c`，136项摘要全部一致；SW SHA-256 为 `c2dfd8fb13a57039ba2ec9fff4eded6f610cf3067c12fd31ac6f8f6b7f3b36cc`，Host 为 `582fea80b23bf48d01aa81bbe754f5a9a7d67df653bc5cbb6d02c899e1a90df4`。其中 SW 仍含已有关联时直接调用账号读取的旧分支，未包含本轮损坏降级；所以这些摘要只证明遗留产物一致，不能串成当前 `account-service.js` 源码摘要 → 构建来源回执 → 实际 SW 的证明。

当前 Chrome 可只读发现原详情标签页 URL 中的 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi`；浏览器控制接口明确拒绝接管 `chrome://extensions` 内部页，按其诊断文档核对后，没有可用的内部页替代能力。本轮未重试、未改用特权脚本或其他控制通道。详情 URL 不证明扩展启用、实际加载路径、应用 revision 或正在运行的 SW；这些项均为 `NOT_TESTED`。浏览器只读会话已释放，原用户页面保留，未打开/关闭/重载业务页。

**Native 与夹具前置仍缺失：** 原 `opendesk browser doctor` 返回 `connected=false`、`local.installed=false`、`socketExists=false`，报 `/Users/mac/.opendesk-browser/native-agent-r1` 不存在。只读发现的 OpenDesk demo Native manifest 允许另一个 demo ID，不能作为本次企业服务配对的证明；未改 manifest、凭据或配对。最初尝试的 `doctor --help` 返回 `E_SCHEMA`，已分类为命令参数不支持，随后用原无参数 doctor 取得上述结果，不记为产品回归。

两个服务测试的合成合同已沿现有入口核对：账号损坏由测试临时记录触发，丢 bind 回执由测试 Native 替身触发；Host 测试同样合成浏览器身份。这些不是原生故障夹具。已有 `manage.mjs serve --native` 是显式、受认证的 provider 注册入口，没有提供已核验的损坏账号/丢回执安全造景与恢复合同；既有 Cookie 原生驱动覆盖其他 Cookie 操作。当前未找到可用且 owner 明确的隔离 Profile/企业服务夹具：未观察到运行中的 CFT，默认开发 Profile 根不存在；不据此断言其他位置没有历史 Profile，也不复用归属未知的目录。没有在日常账号注入故障或新建特权入口。

资源已一次协调，Scrapy owner `01a192d9-942f-7820-9900-76d67213c741` 的本任务回执明确：不持有输入、Chrome、Profile、Browser writer 或 Cookie 夹具，也未释放任何日常/他人隔离窗口。其项目编译 PID15730、快照 PID15964 保留；非其所有的 runner PID11223 同样不动。本轮仅此只读核对，无实际资源冲突；未触及 S3 账本和工作记录。

| 本轮必需用户操作 | 结果与证据缺口 |
| --- | --- |
| 正常进入企业页，读取原连接、资源、策略，再退出重入 | `NOT_TESTED`：无本轮实际候选及已核验隔离 Native 入口 |
| 损坏账号重入后明确解绑，独立确认远端撤销，再移除本地关联 | `NOT_TESTED`：无合法可恢复损坏夹具，未发出解绑 |
| 另一份合成绑定在损坏后直接断开，独立确认设备及绑定撤销 | `NOT_TESTED`：同上，未发出断开 |
| 重入未知结果，独立读回原操作 ID/pending，验证同身份禁重放 | `NOT_TESTED`：无合法丢回执原生夹具，未创建/重放未知操作 |

这些结果是环境、驱动及夹具证据缺口，不是已复现的产品失败或 PASS。本轮没有安装、连接、绑定、解绑、断开、授权、Cookie/账号写入、构建、打包或强制刷新；没有待对账的新副作用请求，也没有新操作 ID。旧 unknown 的原记录与刷新围栏保持，不能以本轮未发请求推断旧请求未发生。未新增产品评分，`NOT_SCORED`。

唯一下一步：**先取得 owner 明确、可恢复且能独立读取权威账本/原回执的隔离原生夹具。** 入口落实后，在该 owner 的具体资源窗口内复用原认证 Native 和原 serve，确认本轮源码确已发布并应用，再对同一候选执行表中四条流程；当前不在日常环境安装/升级 Native 来代替这项前置，也不因缺证据重跑已有 Node 检查。

Git 单独报告：本轮没有明确提交/推送授权，索引仍为空，没有暂存、提交或推送。待保存仍是原七文件：项目 `trusted/account-service.js`、`tests/service-connections-host.test.mjs`、`tests/service-session-integration.test.mjs`、`README.zh-CN.md`，以及根 `scripts/bundle-provenance.mjs`、`tests/environment/cookie-account-provenance-r134.test.mjs`、本工作记录。本轮仅向本节追加事实，其他并行文件及历史记录保留。收尾只核对本节格式/链接、JSON、源码摘要和限定差异，不启动产品测试或构建。
