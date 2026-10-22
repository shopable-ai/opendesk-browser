# Cookie Editor · 正式 Cookies SDK 安装工具

## 当前安装包 2.0.31（2026-10-22）

唯一正式 JSON 已同步当前共享设计 CSS，版本为 **2.0.31**，SHA-256 `899046b569b5f6d9f3b2f84d99e78c880d316fcececb1488452fc24902199cfb`。本次保持工具 ID、能力、HTML 和业务 JS 不变；旧 2.0.30 JSON 的 CSS 与当前源码存在漂移，现由原编译器和打包器重新构建，经定向包/设计测试后晋升，`--check-project` 同源检查通过。

请通过原可信安装器审阅同 ID 更新，保留数据；不要先卸载。在 Chrome 156.0.8078.4 的独立 production Profile，经原可信安装器完成 **2.0.30 → 2.0.31** 审阅升级，并核对安装版本、授权后的真实 Cookie 空态和工作区几何。Browser 候选 SHA-256 为 `642430bddfa2ec8cb087174f625652a3b831934a9b228de54e588b2160c1a092`；原始记录在本机 `artifacts/sidebar-full-height-r13-local-closeout/package-native-closeout/`。此限定结果为 PASS，旧版非空数据保留和完整尺寸/业务验收仍为 `NOT_TESTED`。以下 2.0.30 原生记录仅证明旧候选，不能沿用为新包 PASS。

## 2.0.30 dev 交付记录（2026-10-20，R5.30.3）

当时唯一安装包为 **2.0.30 / opendesk.sidebar-tool.v2**，使用 `opendesk.react-ui.v1`。正式入口 `app/entries/official.jsx` 与离线预览共用 `app/CookieEditorApp.jsx`，完整保留现有列表、原位编辑、导入导出与离线工作区；该轮没有重建预览或重设计界面。

首次在可信设置点击「允许管理所有网站 Cookie」，明确批准 HTTP/HTTPS 范围，之后切站复用授权。该范围仅授予精确匹配官方目录及来源记录的安装包，绑定版本、包摘要、安装代际和 Store；旧单站授权不会自动升级，其他工具不能继承，也不会自动枚举全部网站 Cookie。撤权同时清除本工具旧单站授权。

导出继续使用原 React 工作区。复制、下载在原点击期间取得一次性 Intent，仍经 Host 精确确认操作与回执，不再重复显示「允许本次导出」。只读加载或写入前预检遇到切站时安全取消并重新读取；只有实际写入或导出已经发出才保留未知结果警告，连续事件不能清除该警告，也不会重放操作。

持续开发仍加载 `dist/development`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，复用已有 `npm run dev`。**watcher 不会自动替换已安装工具**：通过「扩展 → Cookie Editor 管理 → 审阅新版 → 确认更新」同 ID 升级。真实 Mac Chrome 测试 Profile 已从 2.0.29 更新到 2.0.30，包 SHA-256 为 `52a78930efae167db0d2482332f9a84e879b19fad81e61bdcbe1fdc653885ac3`；A/B/C 及同域切换无需点重新读取，原位保存重开、工作区导出、单击复制下载、撤权清空均通过。同 Profile 重启后包摘要和授权代际不变，无需重新授权或手动重读；测试 Cookie 已清理。[定向证据](../../../docs/framework/workstreams/evidence/cookie-editor-r5303-20261020/result.json) 分别记录 Node、开发连接及原生操作。用户个人 Chrome 的本次工具升级、最终 production 候选及完整发布验收仍为 `NOT_TESTED`。

## 历史版本说明

以下保留旧版入口和验证记录；其中 2.0.23、2.0.29 等版本及其逐站授权说明不覆盖当前 2.0.30。2.0.29 曾在日常 Chrome 完成更新与核心读写；该历史事实不证明本次个人 Chrome 已升级。

**入口：** Side Panel「扩展」→ **Cookie Editor → 打开**。首次安装浏览器扩展时，可信离线目录自动预装工具包，不运行工具代码、不自动授权 Cookie 网站；旧 Profile 未安装时，直接在「扩展」列表点击「安装」进行可信审阅，然后打开。也可将本目录源码打包为 JSON 后手动导入。默认中文，官方目录为 `installationPolicy: preinstalled`；工具包 **2.0.23 / opendesk.sidebar-tool.v2**。**历史 2.0.4 隔离 CFT 候选**曾通过真实发现、安装、授权、读取、编辑、新建、保存回读和精确删除；该记录仅适用于当时的工具包。**当前 2.0.23 在用户系统 Chrome 的升级及导入仍为 NOT_TESTED**；不能将历史截图、回执或分数延用为当前版本的 PASS/95+。所有 Cookie 修改均从已安装工具 UI 发起。

## 手动导入报错与安装版本（2.0.23）

系统 Chrome 可能仍安装 2.0.19：它会因一条过期记录拒绝整份输入，还保留真实导入 10 条限制，并统一显示 `E_COOKIE_IMPORT`。更新扩展的 `dist/development` **不会自动更新已安装工具或当前 iframe**。在「扩展」中通过原有官方候选的「更新」，或「更多操作 → 导入本地工具包」选择本目录唯一 JSON，核对同 ID `cookie-editor`、版本 **2.0.23** 后确认更新，再主动打开；不要卸载或清数据。更新前保留自己的输入，不能从目录版本推断当前运行版本。

新版逐条区分可导入、过期和无效记录；过期跳过，不改变有效期。预检失败分别指出存储区查询、分区查询、回执校验或已有 Cookie 查询，并保留已知安全错误码（例如 `E_COOKIE_STORE`、`E_COOKIE_PARTITION`、`E_SITE_GRANT_REQUIRED`）；未知错误码回退 `E_COOKIE_IMPORT`，不会显示 Host 异常正文。原输入和格式保留，可在同一输入框修改后重新预览，失败预检不会写 Cookie。不要为排错删除 Store/Partition 或扩大权限。

此前“当前 OpenDesk Browser 尚不支持批量 Cookie 写入”来自当前沙箱公开 SDK 缺少 `cookies.setMany` 的检查，位于写入请求之前。**2.0.23 自动选择已有公开写入接口**：支持 `setMany` 时保持自动分批、每批可信确认；缺少它但支持 `set` 时逐条导入，每条仍需在 OpenDesk 可信窗口确认并回读。界面提前说明确认次数，用户无需判断 iframe 实现；仅两种写入接口均缺失时提示刷新扩展。工具 JSON 与 Chrome 扩展脚本仍分别更新，不从磁盘包版本推断活动文档版本。

两种路径都保留原 Store/Partition 和有效期，遇到拒绝、坏回执、未知结果或目标/授权变化立即停止，不重放剩余记录；批量调用已经发出后不会切换为逐条写入。失败保留原文，需先核对实际 Cookie 后重新预览。日常开发的安全刷新也可能因任务、原生请求或工具未保存输入而延后，不跳过这些保护。

## 快速开始：使用已安装扩展，或编译本地 JSON

**路径 A：使用内置官方工具，不需要单独编译本工具。** 全新 OpenDesk Browser 安装自动预装 Cookie Editor：Side Panel →「扩展」→ Cookie Editor → **打开**；首次使用在工具可信「设置」中独立批准网站和所需 Cookie 权限。对于已有 Chrome Profile，更新版本、重启、访问「扩展」或主动卸载后不会强制补装；如果未安装，会作为默认可见的可信预装候选，选择 **安装 → 审阅能力 → 确认安装 → 打开**。工具安装不运行 Cookie 代码，也不自动批准任何网站。若正在运行的旧版扩展缺少官方候选，仍须让原 `dist/development` 开发构建正确更新；修改 GitHub 源码并不会自动更新已加载的扩展。

**路径 B：安装本地正在开发的版本（推荐用于修改 UI、JS、CSS）。** Node.js 要求 **≥22.12.0**；在仓库根目录运行：

```bash
npm ci --ignore-scripts --no-audit --no-fund  # 初次准备依赖；已有依赖可省略
# 先构建忽略目录下的稳定临时候选，不覆盖根目录的可安装包
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor \
  --out artifacts/sidebar-tools/cookie-editor/candidate.opendesk-tool.json
# 执行本工具的专项 Node、存储、权限和包测试；只有受影响测试 PASS 后才能晋升
node --test tests/environment/cookie-editor-ui.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor \
  --promote-from artifacts/sidebar-tools/cookie-editor/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor --check-project
```

**项目目录已附带可直接导入的 `cookie-editor.opendesk-tool.json`。** 克隆或下载该目录的开发者不需要 Node.js 就能安装测试。它是从 `tool.config.json` 和 `src/` 通过原打包器生成的可移植快照；修改源码后先编译临时候选，完成受影响测试，再按上述 `--promote-from` 显式晋升并将唯一正式包和源码同步提交；失败不覆盖旧正式包，`--check-project` 会检查当前生成字节与提交包一致。不要手工编辑生成的 JSON。

然后在当前 Chrome 的 OpenDesk Side Panel →「扩展」→ **更多操作 → 导入本地工具包**，选择目录内的 `cookie-editor.opendesk-tool.json`（或原 `artifacts/` 输出文件） → 核对 ID `cookie-editor`、版本、文件来源和 Cookies 敏感能力 → **确认安装/更新** → 在已安装列表中点击 **打开**。如果原有同 ID 工具已经安装，应走“更新”而不是先卸载（卸载会清除工具本地数据及授权）。每次改完本工具的 `src/...` 后重新执行上述打包并**明确导入确认**；正式发布更新时同步评审并提高 `tool.config.json` 版本。导入动作本身不运行代码，也不自动授予某个网站的 Cookie 访问权限。

**两个 JSON 的区别：** `tool.config.json` 是构建配置，不能直接导入；`cookie-editor.opendesk-tool.json` 才是可直接安装的发布包。后者由原有 `scripts/build-sidebar-tool.mjs` 生成，`artifacts/sidebar-tools/<id>/<version>/` 是保留的本机输出。随项目提交的预生成 JSON **不是第二份业务源码**，所有修改应从 `src/` 重新打包，自动一致性测试能防止包与代码漂移。该工具是 **OpenDesk Sidebar App**，不是能通过 `chrome://extensions`「加载已解压的扩展程序」直接安装的 Chrome Manifest 扩展。

**什么时候才需要更新整个 OpenDesk Browser？** 日常开发复用既有 `npm run dev` watcher 和固定 `dist/development/`，核对 Chrome 实际加载路径、扩展 ID 及「调试」中的开发连接/构建指纹；不要另起静态构建覆盖 watcher。工具包仍需按同 ID 正式更新。**只有本目录 UI/JS/CSS 变化时，不需要重编整个扩展**。验证真实 Cookie 读写前先打开普通 HTTP(S) 网站，并在已安装工具的可信「设置」明确授权管理所有网站 Cookie；不要把“工具已安装”误当作“已经有 Cookie 权限”。

用于不安装的只读预览：`node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/cookie-editor`。它会生成 `STAGED_NOT_INSTALLED` 快照，**不能**替代正式安装、授权或真实 Chrome 验收。

## 用户能完成什么

1. 在实际 Chrome 打开要管理的网站 → 首次点击「允许管理所有网站 Cookie」。以后读取、保存、导入复用已批准范围，可一键撤销；安装或选择网址不自动授权。Host 继续核对 Chrome 网站权限与每次操作身份。
2. `OpenDeskSDK.browser.cookies.getAll({url})` 读取真实 Chrome Cookie 元数据，显示 Cookie 名称、Domain/Path、Secure/HttpOnly/SameSite、Session/Expiration、Store/Partition。真实值默认隐藏；必须包含 `values` 授权才可按需显示或导出。
3. `cookies.set/remove` 实际新增、编辑、精确删除；原位操作通过真实点击绑定的 Host Intent 验证，原生回读和结果未知不自动重试。Name 可直接修改，并按先新建核验再精确删除旧名称执行（非原子）。未改动的隐藏 Value 仅在获准敏感值权限后临时读取保留；也可主动提供新 Value。未授权时绝不静默写空值。
4. `clearSite` 只清理选定主机的 Host-only Cookie、批准的 Store/Partition、最多 50 条。先生成含 **60 秒、一次性 `previewRef`** 的预览；清理前核对精确 Cookie 身份集合，数量相同而内容改变也拒绝。实际删除仍需可信点击；Worker 重启、撤权会使旧预览不可用。
5. `observe.start/getStatus/read/stop` 手动启动最长 15 秒的有界脱敏变化观察，携带 cursor/gap。事件不传 Cookie 值。
6. 文本或文件可自动识别 JSON 数组、带 `cookies` 的对象、单条记录、名称值字典、Cookie Header 和 Netscape。支持 UTF-8 BOM、`Cookie:` 前缀、分号/换行及值中的等号。预览逐条列出新增、覆盖、过期及无效原因，确认时仅写可导入项并明确统计跳过数；错误后保留原文供修改。JSON 导出可直接回导。真实导出 JSON 默认含值，复制或下载仍需已有敏感值授权与本次最终确认；仅导出属性放在「更多选项」。

### 2.0.20–2.0.23 导入范围

- 真实导入没有每批 10 条、预览 500 条、离线工作区 200 条等用户条数限制；系统自动分批，用户无需拆文件。原文与离线规范数据采用独立的 8 MiB 暂定内存保护预算，超限明确提示并保留输入，不截断。它不是 Chrome Cookie 数量上限。
- 优先使用公开 `cookies.setMany`，系统按 SDK 单请求 12,000 字节合同保留余量，自动分为不超过 11,500 字节 / 50 条且同 Store/Partition 的批次，用户无需拆文件；每批一次可信操作确认。当前 SDK 只有 `cookies.set` 时使用该已有接口逐条导入、逐条可信确认，不因缺少批量 facade 而拒绝整个导入。
- 列表与导入预检使用公开 `cookies.getAllPage` 自动读取全部页；每页按响应字节预算裁切，游标绑定同一快照，数据变化则要求刷新，不拼接不同快照。旧扩展缺少分页接口时仅能使用原单次读取。导出仍受现有公共剪贴板/文本下载 150,000 字节合同约束，不能把该传输预算用于限制导入。
- 每条复用现有 Cookie Service 的写入与 Chrome 原生精确回读。保留有效记录的值、安全属性、路径、过期时间及分区；缺省 Domain/Path/Store 依当前站点和格式语义补齐。显式外域、其他 Store/Partition、重复身份均显示为无效，不改写身份。已过期记录跳过，不延长过期时间或改成会话 Cookie。
- 批次遇到失败或未知结果立即停止，显示已确认数量和原始记录序号，保留原文，不自动重试。预览后发生过期则要求重新预览。

## 唯一架构及授权边界

```text
已安装的普通 Sidebar Tool (不可信 sandbox)
  → OpenDeskSDK.browser.cookies.*
  → 原 Sidebar Tool Bridge
  → Side Panel 真实安装身份/包摘要/Install Epoch/用户明确授权范围
  → 原 Browser Dispatcher / Host
  → 原 createTrustedCookieHost / createCookieService
  → Chrome Native Cookies API
```

任何声明 Cookie Capability 的普通已安装工具都使用同一受信工具设置入口，不因 Cookie Editor 官方来源获得 BUILTIN_TRUSTED 特权。Host 校验真实 Sender、Chrome Cookies + Host Permission、明确 Origin、Store、Partition、Capability、版本/包摘要/Epoch；Page SDK、开发预览和跨工具不得继承授权。敏感值只在当前用户请求中临时显示，不自动写入工具 Storage、草稿、遥测或云端。

**旧内置可信 Cookie 管理 UI 尚保留。** `browser.cookies.approve/execute` 只供历史可信 UI 内部防重放使用，不是工具 SDK；正式 Cookie Editor 在真实 Chrome 通过正反向与生命周期验收后再迁移和去除重复产品入口，避免现有原生 Cookie 功能倒退。

## 验收（真实结果与缺口）

| 项目 | 当前等级 |
| --- | --- |
| 11 项公开 SDK、Schema、Host 与 Tool Capability | SOURCE_WIRED |
| 真实读/值/写/删/清理/观察的 UI 调用 | SOURCE_WIRED |
| V8 JavaScript 语法检查 | PASS（仅语法，不是功能或 Chrome） |
| Cookie/SDK Node 专项测试 | **2.0.6 CI 148/148 PASS**（[原始运行](https://github.com/shopable-ai/opendesk-browser/actions/runs/38566962748)）；旧版通过记录按旧候选保留 |
| 官方工具打包、Check | **2.0.6 CI PASS**；工具包 SHA-256 `4c33f88df17b92331dba197cc4c63535940e6117647267458a7fc1024b5284e9`（CI 候选，不是 Mac 已安装包） |
| Build、Build:dev、Verify | **2.0.6 CI PASS**（未替换或验收 Mac 日常扩展） |
| 完整 npm test | **2.0.6 CI FAIL：2418 PASS / 1 FAIL / 9 SKIP（共 2428）**；唯一失败为旧 Time Review R1.5.1 静态断言，不属于 Cookie Editor；不删除/降低断言 |
| Mac Chrome 安装、真实授权、核心操作/导入导出/清理/观察/撤权/启停/卸载/升级 | **2.0.6 NOT_TESTED**。历史 2.0.4 隔离 CFT 核心流程为 PASS_SCOPED，但不能升级为本版结论 |
| 宽度与 Zoom | **2.0.6 NOT_TESTED**：300/320/360/420/520 CSS px、Side Panel 自身 Zoom、明暗模式均需同包原生截图；旧版 360 px 记录仅供历史参考 |
| 八项产品级专家评分 | NOT_SCORED |

可在真实 Mac 工作区运行：

```bash
node --test tests/environment/browser-sdk-r9-installed-cookies.test.mjs tests/environment/browser-sdk-r7-trusted-cookies.test.mjs tests/environment/browser-sdk-r8-cookies.test.mjs tests/environment/cookie-editor-ui.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor --out artifacts/sidebar-tools/cookie-editor/candidate.opendesk-tool.json
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
npm run check && npm test && npm run build && npm run build:dev && npm run verify
```

测试只使用虚构 Cookie。运行命令及真实 Chrome GUI/CFT 证据必须绑定对应源码输入、工具包 SHA-256 和扩展构建 Hash；不能用 DevTools 直接调用 `chrome.cookies` 冒充用户安装路径验收。R2/R2.1 历史阻塞与组件冒烟保留在原工作流中，不替代 2.0.4 的同候选原生报告。

R3.3 新候选：授权变化后经已有 Bridge 自动检查当前网站；拒绝与读取失败显示独立状态；未完成 Host 操作期间锁定网站与模式控件；普通确认不再采用危险操作红色样式。正式产品默认不进入离线工作区。历史 1.0.0 官方发行仍是离线包，已安装用户必须在「发现工具」明确升级；不能静默同版本替换。

2026-10-14：上述核心旅程、导入导出、清理、观察、升级和生命周期已取得隔离 CFT 的限定原生证据；宽度、Side Panel 自身 Zoom、真实跨 Store/Partition、F3/ZIP 等缺口与全仓 FAIL 继续保留。当前核心、Path 隔离及部分重命名绑定身份保护修复后的候选；未受影响项保留前一候选身份限定复用。本轮原始证据和 Git/CI 状态见原工作流 `r33Local` 与 [续接提示词](../../../docs/framework/prompts/cookie-editor-r33l-core-first-handoff-20261014.zh-CN.txt)。

## R4.3 视觉基准与 2.0.7 源码归属（2026-10-15）

- **已确认的原版 HTML：** `preview/cookie-editor-r4.3-preview.html`，保持已评审的独立 HTML/CSS/JS 原文（模拟数据、无真实 Chrome 授权）。不得把模拟 Cookie 或演示脚本打进 Sandbox 安装包。
- **正式产品：** `src/index.html`、`src/style.css`、`src/main.js`。R4.3 紧凑 Cookie 列表、原位单条编辑、常显导入/导出/新建、展开筛选和导入/导出表单；Browser SDK、Host 原生读写、权限及撤权按已有合同执行。
- **可安装包：** `cookie-editor.opendesk-tool.json` 经既有 packer 的 canonical schema/serializer 与当前 `src/` 一致，版本 2.0.7（历史 R4.3 版本）。`preview/` 不属于发布包。
- **授权边界：** 模拟 HTML 的“允许查看与编辑”不等于真实 Chrome 授权；正式首次授权须经可信工具设置/Host 的真实用户手势。Sandbox 不自行申请或伪造 Cookie 权限。
- **分级验收：** Node、CI、安装包一致性与 Mac Chrome 原生各自记录。2.0.7 无同候选原生证据前标记 `NATIVE_NOT_TESTED`。

## R4.4 源码对齐与验收边界（2026-10-15）

- 黄金原版：`preview/cookie-editor-r4.3-preview.html`；Git Blob `7a129f509814805ab78827eaccbc77a64b20010f`。不得改写、打包模拟数据或复制原型实验台。
- 正式产品：`src/index.html`、`src/style.css`、`src/main.js`。已对齐列表标题右侧高频导入/导出/新建、紧凑名称和 Domain/Path、轻量筛选按钮、原位单条编辑、折叠高级属性、编辑内敏感值显示和精确删除、行内导入导出。宿主已经提供返回/标题/设置，因此不在 Sandbox 内复制演示页首。
- 权限安全：仅真实 Browser SDK/可信 Host 的 Chrome Cookie 读取、写入与删除；网站权限在可信设置中一次明确授权，覆盖本包声明的读取（含敏感值）、写入、观察与清理；可一键撤销。撤权、网站改变、列表失效时立即清除显示出的敏感值；未知写入结果不自动重试；重命名仍先核验写入新名再精确删除旧名。
- 构建规则：先构建忽略的候选，跑完定向测试，再执行当前脚本的 `--promote-from`，最后 `--check-project` 校验源包字节完全一致。不可手工覆盖可安装包。
- 验收状态：R4.4 新候选的 `NODE_NOT_TESTED`、`NATIVE_NOT_TESTED`、`CI_NOT_VERIFIED` 在对应真实执行或 CI 证据建立前始终有效；早期工具包截图或模拟事件不作为通过证据。

### R4.4.1 384px 栅格兼容补丁（2.0.9）

- 修正 R4.4 筛选按钮组沿用了旧四列 Grid 布局的问题：主筛选按钮独占一行，附加排序使用下一行右对齐；确保 384px Side Panel 不挤压控件。
- 这次仅调整正式 CSS、更新三段式版本、重新生成官方安装包及定向断言；黄金预览仍保留原始 Blob，Cookie Host/SDK 业务逻辑不变。
- 2.0.9 仍需真实 Node/CI 和 Chrome 原生截屏验收后才能声明最终通过。

### R4.5 空白草稿误报修复（2.0.10，2026-10-16）

- 新建/编辑时记录字段快照；仅实际变更时发出 dirty。撤销修改后自动 clean；无需因为打开窗口、聚焦、选择导入格式等动作提示未保存。
- 已有 Cookie 未修改就点击保存会关闭编辑面板，不向 Chrome 发起写入或敏感值授权；对敏感值字段，未触碰空白代表保留旧值；明确编辑后清空代表写入空值，且必须触发未保存提醒。
- 预览 R4.3 保持视觉布局，仅修改草稿检测。原始文件保留在 Git 历史。
- 提交的安装包版本 2.0.10，使用同一工具 ID。验收命令：`node --test tests/environment/cookie-editor-r43-parity.test.mjs tests/environment/cookie-editor-ui.test.mjs` 和 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor --check-project`。
- 当前仅为源码与候选包修改，Mac Chrome 已安装文件不会自动覆盖；须明确更新安装包，真实 Chrome 验收仍为 NOT_TESTED。

### R4.5.1 兼容性闭环（2.0.11，2026-10-16）

- 保留 Chrome Cookies SDK 既有显式写入空字符串契约；被遮蔽的值输入框仅在未编辑时才代表保留原值。编辑后清空是明确写入空值，必须显示未保存状态。
- 导出 MIME 类型继续由 `browserTextDownloadUrl` 公共 SDK 实现，CI 测试验证正式宿主调用及 JSON 文件的真实 MIME 映射，不再断言旧宿主文件中必须存在 MIME 常量。
- 与 R4.5 相同，未做 Mac 已安装工具与真实网站 Cookie 原生验收。版本 2.0.11 需通过手动更新同 ID 安装包验证。

### R4.8 复制与下载（2.0.12，2026-10-16）

- 正式 Chrome Cookie 导出区仅显示「复制」「下载」两个主要按钮，顶部关闭仍可取消；预览同名操作同步，320px 起使用两列布局。
- 两者共用授权范围与序列化；默认 JSON 元数据不含值且无法恢复，含值备份每次最终确认，读取走独立敏感值授权。
- 复制复用 `OpenDeskSDK.browser.clipboard.writeText`，下载复用 `OpenDeskSDK.browser.downloads.text`；错误不回显不可信 SDK 文本，跨网站及授权变化时废弃旧异步结果。
- GitHub 源码与静态校验不等于本机 Node 测试或真实 Chrome 验收，安装后必须在 Mac 进行原生验证。

### R4.8.1 双按钮精简布局（2.0.13，2026-10-16）

- 正式导出区域与 HTML 预览只保留并列的「复制」「下载」两个操作按钮，不增加按钮下方逐项功能说明；小宽度下均分空间。
- 导出格式说明、敏感 Cookie 值读取授权与最终操作确认仍沿用原有机制，不新增提示弹窗或业务接口。
- 以 DOM 静态回归断言守护按钮数量、名称与无附属说明；真实 Mac Chrome 安装仍需单独验收。


## R4.10 · 正式 UI 迁移与 SDK 约束（2026-10-16）

- R4.9.2 获用户确认的紧凑列表、原位唯一编辑器、左 Label / 右 Input、Value 右侧显示按钮和行内放弃提示，已迁入现有原生 JS Sandbox；**没有**迁移 preview 的虚构 Cookie、授权或 Blob 下载实现。
- 正式导出默认选 JSON 含值备份；「更多选项」可以改成无值属性清单。每次敏感复制/下载均先进行可信确认，随后独立通过 `OpenDeskSDK.browser.cookies.*` 请求本网站已授权 Value，才调用正式 `browser.clipboard.writeText` / `browser.downloads.text`。
- 真实导入继续使用同一解析/预检/Store-Partition 身份保护/逐条 Host 确认路径；格式默认为自动识别，低频手动指定收于折叠项。
- React 19 预览 CI [38895344576](https://github.com/shopable-ai/opendesk-browser/actions/runs/38895344576) PASS，但压缩后 UI JS **219999 / 220000** 代码单元、离线 HTML 317263 字节，还不包括正式业务；故正式 UI 使用原生 JS。该 CI 不能证明正式安装。
- R4.8「默认仅属性」属于历史方案，**不是**当前正式产品合同。正式 JSON 默认包括经本次授权读取的可导出 Cookie 值；不具有未经授权的全浏览器备份能力。
- Node / CI / 同源包体积 / Native Chrome 的验收状态须以 2.0.16 同一提交的实际执行结果为准；未执行不得沿用旧版本 PASS。

### R4.10.1 · SDK 错误回执脱敏加固（2.0.16，2026-10-16）

- 正式 Cookie 保存/重命名、删除、清理、观察、导入预检/部分成功，以及离线剪贴板/下载异常，不再向 UI 直接回显 SDK/Host 的未经脱敏错误字符串或代码；仅显示已知代码与受控提示。
- 新增 3 项虚构 Cookie 值的异常回执测试，检查草稿保留及意外敏感值不进入状态文本。已批准 R4.9.2 界面和公开 SDK 调用不改动。
- 最新 Mac Chrome 安装、同 ID 升级、系统剪贴板及宽度/缩放矩阵仍为 NOT_TESTED，必须取得同一候选原生证据。

### R4.10.3 · 已核实删除后的编辑器收尾（2.0.17）

- 本机真实 Chrome 复现：精确删除已由 Native 回读确认，紧凑列表清空，但旧编辑器仍显示失效草稿。
- 仅在 Host 返回 `removed: true / verified: true` 且目标仍有效时，调用现有编辑器清理；取消、未知结果和目标变化仍保留原有安全处理。
- 原 R4.9.2 UI、工具 ID、SDK、权限及安装合同保持原状。最终同候选测试与原始 Native 回执见本轮 `cookie-editor-r4103-local-mac-01a14571` 工作记录；旧 2.0.16 证据不提升为本版 PASS。

### R4.10.3 · 2.0.19 安全回归

Store 绑定后重复身份在写入前拒绝；隐藏已编辑值时同步清除旧值显示；切站 UNKNOWN 提示保留到人工核对；关闭导入或选择新文件会作废旧的异步读取。5 个行为回归先复现后修复。2.0.17 的真实 Mac CRUD 13/13、历史 2.0.15 同 ID 升级 9/9 与导入导出逐项回执保留在本地工作流，不能替代本版本原生验收。

R4.10.3 文件读取回归补充：普通文件 input/change 冒泡不会取消本次读取；关闭、修改文本或选择新文件仍使旧异步结果失效。2.0.18 候选因冒泡回归拒收，其构建证据不代表产品验收；2.0.19 原生验收待绑定当前候选。

### 当前网站一次授权

在可信设置中点击一次「允许管理本站 Cookie」，即可复用本工具声明的网站权限，不再逐项点击授权按钮。授权后同一位置提供「撤销本站授权」。只作用于当前网站和当前安装身份；删除与敏感导出仍保留操作确认。常规验收聚焦真实写入、文件导入和原生回读，不反复执行授权边界矩阵。

本轮本地验收：Chrome for Testing 155.0.8059.39 的 production 候选（源码 `6087d273`）已通过同一 Profile 的 9/9 项短流程：正式安装、当前网站一次授权、保存、macOS 文件选择器 JSON 导入、原生回读、精确清理及撤权。production/development、verify、check 均通过。按用户要求停止反复授权矩阵；完整导出、升级、宽度/缩放和十维 95+ 未在此候选重新验收，不标为 PASS。
