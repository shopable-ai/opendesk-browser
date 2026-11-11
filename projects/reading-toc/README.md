# 阅读目录 · 动态组合应用

「阅读目录」是 OpenDesk Browser「扩展」中的应用，使用 **`opendesk.sidebar-tool.v2` + `pageModule`** 在同一个工具 JSON 内交付侧栏 UI 和网页模块。网页模块通过既有 Page Program 安装链在 **USER_SCRIPT** 世界执行；目录索引、观察器、滚动定位和悬浮视图属于应用项目，不再作为 Browser 固定 Content Script 业务交付。

当前实现与交付边界见[动态应用试点记录](DYNAMIC-PILOT.zh-CN.md)，公共安装、生命周期及通信合同见[应用内网页模块 API](../../docs/api/sidebar-tool-page-module.zh-CN.md)。[功能需求与验收规格](REQUIREMENTS.zh-CN.md)中的旧版本记录须结合本页当前状态阅读。[离线预览](preview/index.html)仅用于界面检查，不证明动态安装、运行代码或原生验收。

## 当前源码与公开接口

- `src/main.js`、`src/index.html`、`src/style.css`：侧栏沙箱 UI，以及应用自己管理的网站/页面启用和悬浮目录显示设置。
- `src/page/main.js`、`src/page/engine.js`：网页入口与生命周期调度；复用项目内 `trusted/model.js`、`view.js`、`placement.js`、`overview.js` 和 `locales.generated.js`。这里的历史目录名 `trusted/` 不赋予动态模块可信宿主权限。
- 侧栏通过 `OpenDeskTool.request('page.request', {operation:'toc.snapshot'|'toc.navigate', payload:{...}})` 请求当前网页实例，不取得任意 DOM 或其他标签页控制权。
- 网页模块通过 `globalThis.OpenDeskAppPage.readContext()` 读取语言、目录与应用数据，通过 `onRequest(({operation,payload}) => ...)` 响应侧栏，并使用同命名空间的 `storage.get/set` 和 ETag/CAS 保存偏好；只在明确 CAS 冲突时重读并合并本次字段变更。容量或未知写入失败不截断数据、不自动重放。
- `@opendesk/ui` 的 `createPageUI/onDispose` 管理资源清理；授权读取失败立即停止。位置和折叠按完整 Origin 校验，页面设置按 `Origin + pathname` 匹配，忽略查询参数和锚点。

版本以 [`tool.config.json`](tool.config.json) 为准，并须与 [`package.json`](package.json) 的 Page 项目版本一致；唯一正式包是 `reading-toc.opendesk-tool.json`。已安装版本、候选编译通过和正式包晋升是不同状态，不能用 README 中的历史版本号替代核对。

## 解耦到了哪一层

旧链路是 Browser 固定的 `page-relay.js` 导入目录网页业务，工具 JSON 只更新侧栏。现在由同一个应用包交付两部分：侧栏在原沙箱运行，网页业务在已审阅的 USER_SCRIPT 中运行；两者经通用 `page.request` / `OpenDeskAppPage` 通信，继续由既有 Installed Page Authority 管理身份、网站范围、撤权和清理。因此目录算法、视图、样式及业务设置可以随应用更新；通用桥、安装器和 Authority 的修改仍须更新 Browser。

本轮没有删除全部旧阅读目录代码。旧 `page.toc` 安装的读取、网站/页面设置与文案、一次性数据迁移，以及仍被安装/来源记录消费者使用的 `official-reading-toc.js` 继续保留；当前动态包不走旧 `page.toc` 分支。只清除了无调用的 `tocScope` / `setTocAvailability` 与隐藏范围按钮监听。逐项保留理由见[残留审计](DYNAMIC-PILOT.zh-CN.md#残留审计与最小清理)。

## 最快使用

1. 在现有 OpenDesk Browser Side Panel →「扩展」导入或更新阅读目录组合包。安装审阅一次展示应用能力与网页模块自动运行范围，再由用户确认；复用现有 Chrome 网站访问和用户脚本权限链，不增加安装后的通用“启用”步骤，也不逐站重复审阅已经合法授予的权限。
2. 打开已允许访问、符合已批准规则的 HTTP(S) 网页。网页目录自动运行；受限页面或缺少实际 Chrome 权限的页面仍不可读。安装/更新回执未知时先核查原状态，不重放操作。
3. 网页与侧栏保留**主要章节 / 当前章节 / 完整目录 / AI** 四种模式。切换模式不滚动正文，点击章节才定位，并以目标进入可读区域的实测结果确认成功；AI 模式仍显示未开放信息，不请求模型或伪造目录。
4. 拖动标题手柄调整悬浮目录位置，支持边缘吸附、方向键及 Home/双击归位；位置和折叠状态保存在应用私有存储。正文变化约 280ms 合并重建，滚动更新当前章节；URL、目录修订、文档、权限或实例生命周期变化会取消过期定位。
5. 点击现有右上角「工具设置」齿轮，在同一设置页控制本站/本页启用和悬浮目录显示；通用管理设置与应用四项开关合并，目录正文不再显示设置折叠行或另一个齿轮。旧宿主保留应用原有设置入口。滑块点击后自动保存，无须另点保存；确认写入后即可返回并保留目录模式及列表滚动。保存中保留保护；保存失败或回执未知时可点「重新核对设置」，只读取实际保存状态，成功后恢复开关及返回，不重复写入。停用停止网页索引；隐藏只移除网页浮层，侧栏快照与定位仍可用。恢复设置由页面模块定期重查，不需要重新安装。
6. 关闭侧栏后网页模块继续运行。父应用停用、卸载、替换或网站权限撤销时，由既有 Authority 与受管生命周期处理停止和清理；动态代码不获得 Background、Native 或 Controller 权限。

## 本地构建与定向验证

继续使用原打包器，它会调用原 Page 项目编译器，将 `opendesk.page-install.v1` 嵌入组合包，无需另发第二个 Page JSON：

```sh
node scripts/build-sidebar-tool.mjs projects/reading-toc --out artifacts/sidebar-tools/reading-toc/candidate.opendesk-tool.json
node --test projects/reading-toc/tests/dynamic-page.test.mjs
```

按本次改动补充受影响的包身份、权限或视图检查。候选通过相应检查后，使用同一打包器核对当前源码并晋升唯一正式包：

```sh
node scripts/build-sidebar-tool.mjs projects/reading-toc --promote-from artifacts/sidebar-tools/reading-toc/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs projects/reading-toc --check-project
```

普通构建不会覆盖正式 JSON，也不会更改已安装应用。用户安装与更新继续经过「扩展」原有审阅链；日常 Browser 开发复用已有 `dist/development` watcher，不覆盖其输出或停止其他会话服务。应用网页业务随组合包更新；通用桥和 Authority 的框架变更仍须进入实际运行的 Browser。默认只做当前改动所需验证，不把全量 CI、production 构建或历史验收矩阵作为每次迭代前置。

## 当前证据与未验证项（2026-11-11）

- **1.1.11 设置退出恢复**：系统 Chrome 已观察到 1.1.10 设置页四个开关禁用、返回提示工具仍有未完成操作；用户确认此前点过滑块。修复确认写入后仍等待显示读取才释放 busy，以及失败后无只读恢复入口的问题；设置未读到前禁用滑块，避免不能保存的输入制造 dirty。项目行为 49/49、组合包 9/9 通过，独立只读复核未发现 P1/P2；正式包版本及元数据见[本轮记录](INSTALLATION-TESTS.zh-CN.md#当前--设置滑块自动保存与返回2026-11-11)。系统 Chrome 更新与修复后操作仍为 `NOT_TESTED`，桌面由其他 owner 占用；未重载扩展或改写运行状态。
- **1.1.10 加载与目标切换围栏**：实际 Host 加载错误使用 `E_DOCUMENT_UNRESOLVED`，现在给予 10 秒中性加载窗口；持续失败仍保留原因及安全刷新步骤。切换目标立即停用旧目录跳转/设置并丢弃迟到回包。40 项项目检查、9 项组合包及两项语言/来源检查通过，唯一正式 JSON 同源晋升。系统 Chrome 已通过原审阅链完成 1.1.9→1.1.10，权限未变化；指定 ChatGPT 文档普通刷新、切换到首页再切回、关闭重开侧栏均自动恢复，完整视图读取 23 个章节；网页内及侧栏点击均定位到真实标题。只读核对包哈希、r10、注册状态及当前文档唯一运行实例一致。此为持续开发核心验证，production 和完整矩阵未执行。详见[当前操作与证据](INSTALLATION-TESTS.zh-CN.md#当前--侧栏加载刷新与恢复体验2026-11-1011)。
- **1.1.9 历史实测与后续反馈**：公共 `page.request` 区分旧会话并返回 `E_APP_PAGE_RELOAD_REQUIRED`，不调用或重授权旧实例；原 Host 重新观察迟到加载状态。此前系统 Chrome 读取 17 个章节、刷新/重开/定位通过；后续仍复现持续的唯一实例错误，因此旧结果不足以证明当前稳定性。保留原权限和范围，详见[历史证据](INSTALLATION-TESTS.zh-CN.md#历史--系统-chrome-网页实例恢复2026-11-10)。
- **1.1.7 百度遮挡最小修复（进行中）**：在 721–1100px 视口保留原 `clamp(90px,15vh,190px)` 顶部避让，修正真实百度搜索按钮被目录浮层挡住；层级、权限、偏好均未调整。组合包 Page revision 7，经原候选/晋升/同源核对，132152 bytes、SHA `159692524b86a27fcc1f7c6f03f986818d60924bfa8b7a7926cf7783522444dc`；原位置 13/13、组合包 9/9 通过。实际 Side Panel 更新已保存父应用 1.1.7，但旧网页模块清理未确认，独立恢复审阅仍拒绝补全；当前网页模块不完整。只刷新本任务百度页，未刷新其他 owner 网页；临时样式命中验证不算正式运行代码 PASS。详见 [百度核心 UI 执行卡](../webflow/docs/execution-plan.zh-CN.md#百度固定脚本核心-ui-目标与关键条件2026-11-10)。
- **1.1.6 刷新恢复**：侧栏遇到不完整快照、旧文档失效或网页实例暂未就绪时，先以 250 / 500 / 1000ms 间隔重读快照，显示读取中；连续第四次失败仍显示真实错误并按原策略退避。旧目录保留但禁止跳转，安装损坏仍停止轮询，退出后取消重试，不重放定位或存储写入。36 项应用检查和 9 项组合包检查通过；唯一正式 JSON 经同源候选晋升并核对。ego(lite) 原生 Side Panel 已由 1.1.5 审阅更新至 1.1.6 / Page revision 6，刷新按钮、第 20 节定位及连续三次网页刷新后读取 21 个章节通过。本轮未稳定复现用户原始“目录数据无效”响应，尚不能确认其唯一根因；用户原网页和系统 Chrome 的同场景仍待验证。
- **1.1.5 已通过本轮真实 UI 测试**：在原导入入口补全缺失的配套网页模块，再审阅更新至 1.1.5 / revision 5；整个原私有命名空间保持不变。四项开关位于唯一「工具设置」，宿主语言与启停管理保留；逐项关闭/恢复、返回保持完整目录及第 20 节定位通过。原生命周期与安装链继续拒绝未知清理/已有模块的自动重放；缺失提示改为恢复指引并暂停轮询。语言镜像变化使用新的 Page revision，唯一正式 JSON 已晋升并核对同源。源码、安装、运行和环境边界见[本轮目标和关键条件](INSTALLATION-TESTS.zh-CN.md#当前--115-统一设置与安装恢复2026-11-09)。
- **1.1.3 导入修复已通过真实 UI 测试**：Page revision 提升为 3，原安装链在写入前只读拒绝同 Revision 的源码/规则冲突，打包晋升同步拦截；清理未确认提示保存并刷新旧网页，继续保留未知结果保护。ego(lite) 原生 Side Panel 完成 1.1.2 → 1.1.3，读回仅一份安装且原数据完整；四项设置开关、返回保持模式和第 20 节定位通过。冲突测试包被 UI 明确拒绝，安装仍为 1.1.3。环境、关键条件和证据边界见[安装与更新测试](INSTALLATION-TESTS.zh-CN.md#历史--113-组合包导入修复2026-11-09)。
- **1.1.2 设置入口调整**：移除内容区常驻的设置折叠行，改为标题栏齿轮与独立设置页；四项控制分为“目录索引”和“悬浮目录”。实际应用使用现有 `setNavigation/headerActions`，不增加宿主或权限。自动检查覆盖导航降级、目录状态保持、CAS、保存中及未确认保护；ego 源码离线预览已执行开关与返回。后续真实导入暴露旧模块清理和 Revision 复用问题，已由上述 1.1.3 修复并完成 UI 续验；以下原生事实只对应原 1.1.1 基线。
- **1.1.1 已通过原生组合包审阅更新并运行**。旧 1.0.12 → A 1.1.0 → B 1.1.1 使用原安装链；A→B 期间 Browser 构建指纹及 116 个固定文件哈希一致，正常刷新文章后，应用内焦点样式从 2px 变为 3px，章节定位成功。
- 同候选已验证隐藏/恢复浮层仍保留侧栏 21 个章节，设置保存后返回不再误报草稿，主动停用清理受管 UI，恢复后可用；关闭本任务侧栏后网页目录继续定位。唯一正式 JSON 已由同源候选晋升并通过 `--check-project`；最终 9 个受影响测试文件通过。
- 随后的提交前复核修复了网页请求写存储时的重入锁和同文档地址变化误停问题，均有失败前/修复后回归。本次续验在已应用 Browser 修订 `655144df7b06…` 中，不刷新文档依次改变 hash 和 history，章节仍可定位；真实安装的临时应用在请求处理器内等待私有 CAS 写入后返回 `saved:true`，随后已卸载并清理数据。当前地址下隐藏、页面停用、网站停用与恢复也已验证。上述 A→B 独立更新证据仍只对应原冻结基线，应用源码和正式包未变。
- 原生卸载、真实 Chrome 网站撤权、production、真实登录网站完整验收及独立评分仍为 `NOT_TESTED` / `NOT_SCORED`。身份、撤权、未知结果和清理负向行为已有定向自动检查，不能替代上述原生验收。哈希、范围和历史断言缺口见[动态应用试点记录](DYNAMIC-PILOT.zh-CN.md)。

## 历史记录（旧固定 Content / v1 阶段）

以下保留原版本、候选、预览及验收事实，仅对应各自历史基线。出现的固定 Content Script、`page.toc`、宿主齿轮设置、旧源码路径、版本/SHA 与全量构建命令均不代表当前动态组合应用合同，也不是日常开发默认步骤。

### 历史 · 未上线阶段的运行校验（2026-10-26）

按用户当前要求，阅读目录暂不以固定发行版本、SHA-256 或官方来源记录作为读取章节的前置条件。旧版本、本地开发版本及缺少来源记录的已安装目录可直接使用，不再因此要求重新安装。此策略由 `trusted/policy.js` 的 `READING_TOC_RELEASE_IDENTITY_REQUIRED=false` 统一控制网页浮层、侧栏读取和既有标签页接入；以后确有发行需求再评估开启。

仍要求唯一有效的已安装 `reading-toc`、`page.toc` 能力、未主动停用、允许的 HTTP(S) 网站/页面及 Chrome 实际访问许可。第三方目录仍按原网站授权执行；用户可以审阅本地包后直接覆盖同 ID 安装，包括同版本修改或版本回退，覆盖后清除旧官方来源标记。官方目录发行校验及沙箱边界保留。已安装包的自定义翻译仍走原精确来源校验，失败时回退扩展内置文案，不阻止章节读取。

### 历史 · 1.0.x 本地交付与宿主更新

2026-11-09 本地交付升版：按用户要求将安装包由 `1.0.12` 升至 `1.0.13`，仅更新包版本，`page.toc` 能力和包内业务代码保持不变。候选经包格式、来源字节及相关 Node 检查后晋升；本版本浏览器安装/升级为 `NOT_TESTED`。网页悬浮层 `trusted/` 不在 JSON 中，更新该代码仍需 Browser 对应产物。

2026-11-09 按用户要求再次交付 **1.0.13 → 1.0.14**：重新构建、验证并晋升唯一正式 JSON，同步官方版本和摘要，权限及包内业务代码保持不变。“收起目录”按钮高于四模式按钮区域的修复位于 `trusted/view.js`，已进入 `dist/development` 并在 ego 实际网页验证悬停、收起和展开；它不随工具 JSON 更新。本版 JSON 的浏览器安装/升级仍为 `NOT_TESTED`。

2026-11-09 最小层级修复交付 **1.0.14 → 1.0.15**：保持已验证的 `.edge-toggle { z-index:3 }`，高于四按钮区 `.modes { z-index:2 }`；仅此样式修复，不更改任务或更新机制。重新构建并晋升正式 JSON，同步版本、摘要和源码预览；系统 Chrome 中直接修改目标元素为 `3` 的验证有效，持久应用状态不以 JSON 升版替代。

2026-11-09 系统 Google Chrome 复测：在专用 HTTP 文章测试页复现旧层级，DevTools 读回 `.edge-toggle` 实际仍为 `z-index:1`；Side Panel「调试 → 本地开发服务」显示安全刷新因任务、原生请求或未知结果未释放而延后，磁盘 `dist/development/agents/page-relay.js` 已为 `3`。仅在该测试页临时改为 `3` 后，悬停覆盖、收起/展开和四模式点击均正常；随后已正常刷新测试页撤回临时样式。此结果证明样式修正有效，**不证明系统 Chrome 已持久应用新 Browser 代码**。后续沿[已有扩展迭代与内部页限制处理](../../docs/framework/extension-development-r131.zh-CN.md#已有扩展迭代与内部页限制处理2026-11-09)核对安全更新与目标行为；访问 `chrome://extensions` 不是本工具迭代的前置条件。

2026-11-09 修复：最初发现独立更新的官方资源领先于宿主编译 pin，会误报 `E_OFFICIAL_ID_RESERVED`。按用户进一步纠偏，本地文件现在独立走用户审阅和确认覆盖，不再被官方 ID、发行版本、SHA 或 Catalog 可用性限制；本地包不会获得官方来源标记。官方目录入口继续校验其发行包。修复属于 Browser 宿主，必须进入当前加载的 Browser 产物；仅更新工具 JSON 不足以修复旧宿主。

### 历史 · 当前证据与边界

- 2026-11-09 最新：CFT 155 真实原生 Side Panel，用修改代码的 **同版本 1.0.12 本地包**覆盖已停用的官方安装成功；审阅显示同版本内容与来源变化，覆盖后保持停用、清除官方来源、未自动启动沙箱。定向 42 项测试验证本地新装/升级/降级、目录离线、数据与设置保留，以及官方发行校验、取消/过期审阅和未知写入保护。此前正式包的新装、1.0.11 → 1.0.12 更新与文章章节跳转证据保留为历史候选结果，详见[目标与关键测试记录](INSTALLATION-TESTS.zh-CN.md)。用户现有目录未卸载；日常 Chrome、production、真实 ChatGPT/知乎仍为 `NOT_TESTED`。
- 受控 Chrome for Testing 155 正式包、原生 Side Panel、官方快捷安装和本地 JSON 导入、精确 Origin 确认、H1–H6 多标题索引、关闭 Side Panel 后网页目录留存、站点撤销，均有自动化原生证据。
- 真实已登录 ChatGPT、真实知乎、多回答版本切换及用户 Mac 生产 Profile 尚未通过本轮原生验收；模拟 ChatGPT DOM 页面不等于真实站点通过。
- R1.6 定向 Chrome/Chromium、发行集合和 macOS Actions 的最新证据及未关闭事项，见 [R1.6 验收记录](../../docs/framework/workstreams/reading-toc-r16-20261016.md)。不可将 CI macOS 通过冒充用户 Mac 已通过，更不可无证据宣称六维独立 95/100。历史 R4.1 记录仍见 `docs/framework/workstreams/reading-toc-r41-real-chrome-20261010.md`。

### 历史 · R4.2 悬浮位置验收

自动回归：
```sh
node --test tests/environment/reading-toc-placement-r42.test.mjs tests/environment/reading-toc-r41.test.mjs tests/environment/reading-toc-lifecycle-r41.test.mjs
npm run check
npm run build
node scripts/verify-package.mjs dist/production
# 在隔离的 Chrome for Testing 中（不得使用日常 Profile）
xvfb-run -a node --test tests/framework/reading-toc-native-r41.test.mjs
```

手动检查：在已授权文章拖到左侧、拖到页面中间、刷新和重启浏览器验证记忆；同 Origin 不同文章保持位置，不同 Origin 不串位置；窄屏和浏览器缩放后目录仍可见；尝试手柄以外拖动应只执行正常章节交互；方向键移动并按 Home 归位；归位后刷新恢复默认。然后关闭 Side Panel、撤销网站权限、卸载工具，确认不留下页内 DOM 或可操作监听，其他工具不受影响。

R4.2 改动在可信 Content Script 的悬浮视图与位置存储；R4.3 将官方阅读目录工具包从 1.0.0 升级到 1.0.1；R4.4 因 Side Panel 自动来源跟随改动继续升级到 1.0.2，包格式与权限仍为 v1。已安装 1.0.0 的用户可以在 Side Panel 看到「更新」入口，审阅后确认升级，不会自动运行或扩权。新的位置存储键只包含 HTTP(S) Origin（不存完整 URL、标题或网页正文）。真实线上 ChatGPT／知乎、用户 Mac Chrome 以及极端缩放仍须按照证据等级单独验收；组件测试通过不等于真实网站通过。

### 历史 · R4.3 智能概览专项测试

```sh
node --test tests/environment/reading-toc-overview-r43.test.mjs tests/environment/reading-toc-placement-r42.test.mjs tests/environment/reading-toc-r41.test.mjs
npm run build:sidebar-tool -- projects/reading-toc
npm run check
npm run build && node scripts/verify-package.mjs dist/production
```

最重要的手工场景：单 H1 + 20 H2 的文章应出现多条导航与「查看完整目录」；5 个 H1 的页面应只显示 H1；只有 H2/H3 的文档仍应有实用的顶层/子层列表；有 2 个 H1 且有多个 H2 的 AI 回答应显示两种层级。多回答网页切换来源不串章节；三种视图保持正常点击定位和滚动高亮。具体候选证据见 `docs/framework/workstreams/reading-toc-r43-20261011.md`。

### 历史 · R4.4：长文章当前位置与多回答自动跟随

- 在智能概览被限制为最多 12 条时，自动保留**当前阅读章节与附近章节**，同时保留各顶层章节、尽可能兼顾其他章节；不再始终高亮第一个 H1。深层正文则显示最近的可见父章节。
- ChatGPT / 知乎等多回答页面如果含多个来源，默认目录来源选择为「自动跟随 · 回答 N」，正文导航切到其他回答时，网页悬浮卡片和 Side Panel 目录一起切换。
- 如需查看此前回答，可从来源列表手动选择。手动选择后保持固定，不随正文变化自动跳转；重新选择「自动跟随」恢复跟随。
- 官方工具 v1.0.2 仍仅声明 `page.toc` 能力，不新增权限，升级须经现有 Side Panel 显式确认。此前安装 1.0.0 / 1.0.1 的用户可以使用「官方阅读目录 → 更新」。

受影响测试：
```sh
node --test tests/environment/reading-toc-overview-r43.test.mjs tests/environment/reading-toc-placement-r42.test.mjs
npm run build:sidebar-tool -- projects/reading-toc
npm run build && node scripts/verify-package.mjs dist/production
```

受控 Chrome 测试新增了“单 H1 + 20 H2 阅读末尾仍在概览显示当前 H2”，以及从 AI 回答 1 导航到回答 2 后 Sidebar 默认自动跟随的断言。用户 Mac 与真实登录站点仍需独立检查。

R4.5 资源迁移的候选、测试与真实浏览器证据见 [专项工作流](../../docs/framework/workstreams/official-tools-catalog-r45-20261011.md)；本页早期 Chrome 记录仍绑定原候选。

### 历史 · R4.6 · 长目录自适应高度与 Side Panel 设置（2026-10-11）

- 网页内目录的 `CONTENTS` 采用四种图标模式（概览 / 当前 / 完整 / AI），另有拖动手柄；**网页上没有独立刷新、归位或设置图标**。Chrome Side Panel →「工具」→「阅读目录」列表行的齿轮位于卸载图标左侧，设置属于可信扩展宿主而非网页内脚本。
- 在齿轮设置中可为当前 HTTP(S) 网站选择网页悬浮目录 **显示 / 隐藏**，也可以**仅在当前页面隐藏**；单个页面范围为 `Origin + pathname`，不保存查询参数或片段。每条规则按工具 ID 本地存储到 `opendesk.sidebar-tools.toc-visibility.v1`，不加入工具包，不改变 `page.toc` 授权。切换设置立即通知所有同 Origin 标签页，SPA 路由变化重新判断。网页目录隐藏后 Side Panel 仍可读取已授权章节。
- 原有行内网站授权圆形开关 `◎` 保持原生显式确认；齿轮内仍可查看、撤销旧网站授权。网站停用时目录索引也停止；**显示/隐藏仅影响网页悬浮 UI**，不能代替权限撤销。
- 目录容器的 `max-height` 随视口高度变化（并继续通过 `--toc-scroll-limit` 避让聊天输入框），不再因为浏览器打开 Side Panel 后网页宽度低于 1100px/720px，就固定成 160px/125px 的极短滚动区。少量章节自然收缩，长内容滚动。
- 卸载通过既有可靠性清理流程一并删除该工具的显示偏好；安装、审核、版本更新和官方 Catalog 不变，也不需重新发布工具包 JS。

**检查要点**：已授权单 H1 + 20 H2 长文章在页面宽度 900px、420px 和 700–820px 高度下能展示明显多于旧 125/160px 的悬浮目录；隐藏当前页面不影响其他路径，隐藏当前网站覆盖同 Origin 页面；此时 Side Panel `toc.snapshot` 和 `toc.navigate` 仍可用；恢复显示、刷新、SPA 切换、多标签、撤权、归位、卸载后均不泄露偏好。受控 CFT 原生测试见 `tests/framework/reading-toc-native-r41.test.mjs`，单元测试见 `tests/environment/reading-toc-visibility-r46.test.mjs`。

### 历史 · R4.8 · 空目录自动恢复与刷新（2026-10-15）

- Side Panel 的 `CONTENTS` 标题右侧新增“刷新阅读目录”；它与“概览 / 当前章节 / 完整目录”分组分离，只重新提取当前已授权网页的章节，不重新加载网页或修改权限。
- 打开时立即读取、空标题时短时补扫、之后约每 4 秒自动更新。读取失败有上限地退避重试，焦点恢复可主动更新；请求单飞，手动点击刷新不会被正在执行的旧请求吞掉。
- 短暂读取失败不直接清空上次成功目录：明确标识为旧数据并禁用章节跳转，直到新数据返回。真正返回空索引时明确显示没有可识别章节。
- 宿主删除静默丢弃 1.2 秒内重复 `toc.snapshot` 的逻辑，改用原有带错误回复的每分钟 120 次总限流。内容脚本存储策略临时失败时先停止索引，再按有界退避恢复授权核验。
- `toc.snapshot` 允许 `refresh:true`，宿主在严格校验站点、文档和工具身份后转发 `forceRefresh:true`，内容脚本强制重新扫描 DOM。能力仍只有 `page.toc`。
- 官方工具包版本为 **1.0.5**；1.0.4 已安装用户须通过原有工具升级入口确认更新，不会静默替换安装包。

定向验证：`node --test tests/environment/reading-toc-recovery-r48.test.mjs tests/environment/reading-toc-lifecycle-r41.test.mjs`。
真实 Chrome Side Panel、用户 Profile、SPA、授权撤销和最终安装需另外按原生验收等级核对；离线隔离测试不构成生产 95+ 实测结论。

### 历史 · R1.2 双语言 UI 与升级

阅读目录的 Side Panel 沙箱和可信网页悬浮 UI 共享 `locales.json` 的 `zh-CN` / `en` 文案；来源标题与网页标题仍保持原文。用户在「扩展」→「更多操作」选择界面语言，加载后或切换中，当前目录模式、来源、章节、悬浮位置以及未完成的读取请求应继续保留。应用默认中文；工具单条英文缺失时回退中文，所有文字资源离线随正式工具版本发布。权威合同：[Sidebar Tool 本地化](../../docs/api/sidebar-tool-localization.zh-CN.md)。

**发行版本（R1.8.6 复核）：** `tool.config.json`、根目录正式安装包、官方 Catalog 的 `reading-kit` revision 7 均指向 **`1.0.8`**。根目录正式 JSON 为 28,481 UTF-8 字节，SHA-256 为 `df3ab8fb74c4b32ae5932333c521f326d72a71256ebfeda412b3d6155f990c42`；CI 已加入 `--check-project` 校验步骤，须以对应 CI 实际结果认定 MATCH；本轮不重复晋升或更改版本。历史 R1.8.1 时尚未晋升的 1.0.7/1.0.8 说明不再代表当前仓库状态。**用户本机 Mac Chrome 1.0.7 → 1.0.8 主动升级、持久化、撤权、回滚与卸载仍须独立验收，不得仅凭发行包一致性宣称通过。**

#### 语言资源与可信悬浮 UI 的边界

- 可编辑唯一源：`projects/reading-toc/locales.json`。独立包构建器在 `src/main.js` 中编入校验通过的文案。
- 可信代码使用 `src/reading-toc/locales.generated.js`，由 `node scripts/generate-reading-toc-locales.mjs --write` 确定性生成并带源 blob 摘要；生成后审阅差异再提交。`npm run check`、`npm run build`、`npm run dev` 都会拒绝未经同步的资源，保持 Content Script 安全来源检查。不得在可信 bundle 中直接 import 工具项目。
- 本地可交互主预览为 [preview/index.html](preview/index.html)，由唯一 `scripts/preview/build-preview.mjs` 官方生成器输出；示例命令见 [preview/README.md](preview/README.md)。它复用正式安装包与可信 `src/reading-toc/view.js`，并不代表真实网站、授权或 Mac Chrome 验收。

### 历史 · R1.8 · 已批准 AI 侧栏 UI 的正式源码迁移（2026-10-17）

- 正式源码候选从 v1.0.7 升到 **v1.0.8**；保持 `reading-toc`、`opendesk.sidebar-tool.v1`、唯一 `page.toc` 能力和三个免费视图的全部索引/跳转/自动跟随流程。该阶段最初只在 Side Panel 提供第四个 **AI** 模式；后续 R1.8.4 已同步至正式网页悬浮目录，目前两侧均有四个模式图标。
- AI 视图默认显示**服务暂未开放**的权益卡及**合作招募**。没有受信会员、支付、AI 生成合同，因此当前不会请求模型、上传正文、生成章节或伪造付款。入口禁用且隐藏，已具备会员/额度/AI 结果不作猜测。
- 这次改动先是**正式源码候选**，不是安装验证声明。项目根目录稳定安装包在候选经 Node/Chromium/原生安装测试并经 `--promote-from` 之前仍为已发行版本。不要手动改写此 JSON、历史 reading-kit revision 6 或用户数据。
- 后续真实接入必须复用受信 Broker 与身份权限合同，并对来源、页面、文档、请求世代和取消/刷新/撤权进行严格校验；未接入时 UI 安全降级。
- R1.8 新增 `tests/environment/reading-toc-ai-r18.test.mjs`，包括正式打包后的 UI、会员可用性、默认推广、locale、四种模式和免费回归断言。必须结合正式 Chromium/Chrome 安装验收及构建结果判断可发布性。

### 历史 · R1.8.1 · 构建和预览证据（2026-10-17）

- 候选生成器 GitHub Actions [#38959360526](https://github.com/shopable-ai/opendesk-browser/actions/runs/38959360526) PASS：`node scripts/build-sidebar-tool.mjs`、双份 `scripts/preview/build-preview.mjs`、19 项定向 Node 测试、`npm run check`、`npm run build`、`npm run build:dev` 与 `npm run verify`；均是 **Linux hosted CI**，不是用户 Mac Chrome。
- 1.0.8 候选 JSON 27,778 UTF-8 字节，SHA-256 `7cb40e48d3e9f5f801f9fd8e181fa7ab15d030cfc15e62585d706579d041be0d`。保存的两份生成 HTML 各 211,846 / 220,396 字节，并由严格同源回归测试核对来源与内容；不修改已批准 R1.7.4 原型。
- 本轮 320 / 360 / 420 / 520px × 中文/英文 × 100/125/150/200% CSS zoom × 四个 Side Panel 模式，共 128 个 Linux Chromium 144 离线布局/交互组合全部通过；实测的是工具包 JS/CSS 的沙箱离线预览，不等于真实 Chrome 缩放、网站 DOM、安装升级验收。
- AI 默认展示会员权益卡和合作招募，会员、支付与 AI Provider 未接入；**用户 Mac Chrome 的 1.0.7 → 1.0.8 安装升级、数据保留、回滚与卸载仍为 `NOT_TESTED`**，不可声称正式发行或产品 95+ 验收已通过。更细证据见 `docs/framework/workstreams/reading-toc-r18-source-migration-20261017.md`。

### 历史 · R1.8.4 · 网页悬浮目录四模式与概览去重（2026-10-17）

- 网页可信 `src/reading-toc/view.js` 已补齐与 Side Panel 同顺序的第四个 AI 星芒图标，普通短文章和多条 ChatGPT 回答都保留四个图标；保留原有拖动与 Home / 双击归位。
- **彻底移除**网页悬浮目录的冗余“还有 N 个章节 · 查看完整目录”按钮及其 DOM。短目录（≤12 条）概览直接显示全部有效标题；长目录仍允许选择顶部“完整目录”，ChatGPT 完整视图保持回答之间的分隔线。
- AI 模式仅显示已经审核的未开放会员卡和合作招募卡；没有模型请求、额度、支付操作或假 AI 章节。切回免费模式保留原快照和标题跳转，撤权、SPA、DOM 自动更新均仍由现有可信 Content Script 管理。
- `reading-toc-r183-inpage-preview.html` 是历史离线快照，不再作为最新 UI 证据。以唯一正式生成器输出的 [preview/index.html](preview/index.html) 为默认主入口；旧版本同源 HTML 已于 2026-10-31 清理，CI 改用唯一入口。离线预览与真实 Chrome 安装升级分别验收。

### 历史 · R1.8.6 · 主预览与正式版隔离

默认预览入口为 `preview/index.html`，显示模拟文章和可信网页悬浮目录；Side Panel 直接在同一入口切换，不再保留历史同源验证页。以下为 R1.8.6 历史证据边界：正式工具的手柄支持双击与 Home 归位；当时原生测试采用真实 Home 键检查存储清除，不能在 CI 完成前声称测试通过，且不恢复网页独立归位图标。当时正式 `reading-toc.opendesk-tool.json` 为唯一可安装包（`1.0.8`）；离线 HTML、Linux Chromium 与 hosted macOS 均不能冒充用户本机 Mac 的 1.0.7→1.0.8 主动升级结果。

### 历史 · R1.9 · 主要章节短 tooltip（2026-10-18）

- 四种视图保持原顺序；第一个模式在网页悬浮目录与 Side Panel 显示“主要章节”/“Main sections”，无障碍名称保留按需要补充子章节的说明。
- 正式工具包版本 1.0.9；默认当前章节、章节识别、跳转、授权和 AI 未开放状态保持不变。源码、包和离线 HTML 需同候选重新测试；没有真实 Mac Chrome 证据时不得称验收通过。

### 历史 · R1.9.1 · 1.0.9 市场修订与验收状态

- 当前正式 `reading-toc` 包与受信身份为 **1.0.9**；上述“R1.8.6 发行版本 1.0.8”记录是历史基线，不代表现行版本。
- 原最新阅读组合 revision 7 仍固定 1.0.8，现追加不可变 revision 8 固定 1.0.9，保留历史版本及每个成员身份；源码提交见 [`c0060a0`](https://github.com/shopable-ai/opendesk-browser/commit/c0060a080754a5f5a33b72b605e218ad7ec1ccf0)。
- CI 中的通用安装器测试不再借用官方保留 `reading-toc` ID；伪造官方 ID 仍须失败。真实网页目录、Site Panel、扩展安装升级和 Mac Chrome 未经同候选验证前不可标记 PASS，详细失败与状态见 [唯一需求规格](REQUIREMENTS.zh-CN.md#7-r191-版本一致性修复与真实验收边界2026-10-18)。

### 历史 · R2.1 · 语言包试点（2026-10-25）

唯一正式包已晋升为 **1.0.10**，官方 pin 同步；源码/包自动验证通过，真实 Chrome 安装仍为 `NOT_TESTED`。详细证据见 [R2.1 交付记录](../../docs/framework/workstreams/locale-packs-r21-reading-toc.md)。旧章节的 1.0.9 是此前正式基线，不能当作本轮语言包已安装的证据。

- `locales.json` 是源文案和已复核英文的唯一作者资源，构建产生只读 `localization` metadata；现有中文原文不改。
- [日语语言包样例](languages/ja.opendesk-locale.json) 包含 55 条业务 UI 文案，格式 `opendesk.locale-pack.v1`，绑定 `reading-toc` 与源 catalog hash；不是可安装工具包，也不会自动随目录加载。
- 工具动态展示采用 Host 只读 `OpenDeskTool.messages`，保留内嵌文案兜底；具体接线和测试状态以交付记录为准。不翻译网页章节或宿主权限/安全文案，可信网页悬浮目录也从同一受控 store 原位更新，但须固定 Content Script 已更新并完成官方包验真；真实 Chrome 尚未测试。
- 作者格式、hash 算法、预算、安全与回退详见 [唯一 R2.1 本地化合同](../../docs/api/sidebar-tool-localization.zh-CN.md)。Page Program、Controller 等扩展类型以后接入。
