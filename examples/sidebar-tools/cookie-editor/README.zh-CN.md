# Cookie Editor · 正式 Cookies SDK 安装工具

**入口：** Side Panel「扩展」→ **Cookie Editor → 打开**。首次安装浏览器扩展时，可信离线目录自动预装工具包，不运行工具代码、不自动授权 Cookie 网站；旧 Profile 未安装时，直接在「扩展」列表点击「安装」进行可信审阅，然后打开。也可将本目录源码打包为 JSON 后手动导入。默认中文，官方目录为 `installationPolicy: preinstalled`；工具包 **2.0.11 / opendesk.sidebar-tool.v2**。**历史 2.0.4 隔离 CFT 候选**曾通过真实发现、安装、授权、读取、编辑、新建、保存回读和精确删除；该记录仅适用于当时的工具包。**当前 2.0.11 的 Mac Chrome 安装/导入/导出/缩放矩阵仍为 NOT_TESTED**；不能将历史截图、回执或分数延用为当前版本的 PASS/95+。所有 Cookie 修改均从已安装工具 UI 发起。

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

**什么时候才需要编译整个 OpenDesk Browser？** 如果刚修改了 `src/` 中的可信 Cookies Host、Browser SDK、权限或 Catalog，或者当前安装的旧扩展缺少相应能力，须在独立开发 Chrome Profile 中从仓库根目录执行 `npm run build:dev`，用 `chrome://extensions`「加载已解压的扩展程序」加载 `dist/development/`，重新打开 Side Panel。**只有本目录 UI/JS/CSS 变化时，不需要重编整个扩展**。验证真实 Cookie 读写前先打开普通 HTTP(S) 网站，并在已安装工具的可信「设置」中按网站和能力分别授权；不要把“工具已安装”误当作“已经有 Cookie 权限”。

用于不安装的只读预览：`node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/cookie-editor`。它会生成 `STAGED_NOT_INSTALLED` 快照，**不能**替代正式安装、授权或真实 Chrome 验收。

## 用户能完成什么

1. 在实际 Chrome 打开要授权的网站 → 已安装工具「设置」→ 按网站分别授权 `browser.cookies.read / values / write / observe / clear`。安装或选择网址不自动授权；第一次授权需该站点处于活动标签页。授权后普通读取可以在其他网站仍活跃时重复使用。
2. `OpenDeskSDK.browser.cookies.getAll({url})` 读取真实 Chrome Cookie 元数据，显示 Cookie 名称、Domain/Path、Secure/HttpOnly/SameSite、Session/Expiration、Store/Partition。真实值默认隐藏；独立 `values` 网站授权后才可按需显示或导出。
3. `cookies.set/remove` 实际新增、编辑、精确删除；受信 Side Panel 每次要求用户明确确认。原生回读和结果未知不自动重试。Name 可直接修改，并按先新建核验再精确删除旧名称执行（非原子）。未改动的隐藏 Value 仅在获准独立敏感值权限后临时读取保留；也可主动提供新 Value。未授权时绝不静默写空值。
4. `clearSite` 只清理选定主机的 Host-only Cookie、批准的 Store/Partition、最多 50 条。先生成含 **60 秒、一次性 `previewRef`** 的预览；清理前核对精确 Cookie 身份集合，数量相同而内容改变也拒绝。实际删除仍需可信点击；Worker 重启、撤权会使旧预览不可用。
5. `observe.start/getStatus/read/stop` 手动启动最长 15 秒的有界脱敏变化观察，携带 cursor/gap。事件不传 Cookie 值。
6. 「离线工作区」仍支持 JSON、Cookie Header、Netscape 读取/编辑/导出，绝不冒充真实 Chrome；真实导入每批至多 10 条，预览并逐条经 Chrome SDK 与用户确认。真实含值导出需要主动触发本地保存和额外敏感值授权。

## 唯一架构及授权边界

```text
已安装的普通 Sidebar Tool (不可信 sandbox)
  → OpenDeskSDK.browser.cookies.*
  → 原 Sidebar Tool Bridge
  → Side Panel 真实安装身份/包摘要/Install Epoch/用户逐站授权
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
- 权限安全：仅真实 Browser SDK/可信 Host 的 Chrome Cookie 读取、写入与删除；元数据授权和敏感 Value 授权分离。撤权、网站改变、列表失效时立即清除显示出的敏感值；未知写入结果不自动重试；重命名仍先核验写入新名再精确删除旧名。
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
