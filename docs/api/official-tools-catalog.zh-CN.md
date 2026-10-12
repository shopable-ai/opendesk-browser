# 官方工具 Catalog、发行资源与默认预装（R4.5 / R4.8）

本页说明已实施的离线官方来源。它复用 [Side Panel 工具 API](sidebar-tools.zh-CN.md) 的包格式和安装器；R4.8 已加入仅限首次新安装的可信默认预装。R5 新增独立市场网站与有限官方安装交接，正式 HTTPS 尚待渠道核验，远程签名整包分发仍未实现。构建源码、发行资源、安装记录和网站授权分别有自己的权威来源。

## 1. 目录职责与真实路径

| 层次 | 路径 | 维护方式 |
| --- | --- | --- |
| 可信官方源码登记 | 仓库根 `official-tools/catalog.json` | 审查后登记稳定 ID、来源项目、运行类型和安装策略 |
| 工具源码 | `examples/sidebar-tools/<id>/tool.config.json`、`src/`、可选 `assets/` | 版本、能力和内容的权威输入 |
| 运行框架 | `src/sidebar-tools/bridge.js`、`sandbox.html`、`official-catalog.js` | 宿主静态资源及可信目录解析；不保存生成工具包 |
| WXT 暂存资源 | `.wxt/public/official-tools/catalog.json`、`.wxt/public/official-tools/<id>/<id>.opendesk-tool.json` | 构建生成，不提交、不手改 |
| 生产扩展资源 | `dist/production/official-tools/catalog.json`、`dist/production/official-tools/<id>/<id>.opendesk-tool.json` | 实际 Chrome 按需读取的发行资源 |
| 开发扩展资源 | `dist/development/official-tools/...` | 与生产相同的生成合同 |
| 单工具本地包 | `artifacts/sidebar-tools/<id>/<version>/<id>.opendesk-tool.json` | 现有独立打包命令的输出 |
| 可选独立官方生成输出 | `artifacts/official-tools-release/official-tools/...` | `node scripts/build-official-tools.mjs` 的默认输出 |

当前随扩展发行的七个官方工具是 `reading-toc`、`web-markdown-clipper`、`quick-notes`、`markdown-workbench`、`knowledge-inbox`、`time-review`、`cookie-editor`。Cookie Editor 是可选安装的本地演示 UI，浏览器 Cookie API 尚未开放给工具。React/Vue starter 继续作为本地开发示例，不因位于 examples 目录就参与官方发行。新增候选只需符合现有包合同、提供可信项目并登记 Catalog；市场展示文案可选，缺省使用真实包标题和描述。

旧源码目录与示例根目录中的官方生成 JSON 已移除。不要把生成包放回 `src/sidebar-tools/`、`examples/` 或文档目录，不再维护需要人工同步的副本。

## 2. 源码 Catalog 与生成清单

源码 schema 为 `opendesk.official-tools.sources.v1`。顶层只有 `schema`、`sourceRepository` 和 `tools`，每项只有以下字段：

| 字段 | 当前约束 |
| --- | --- |
| `id` | 与实际工具配置相同的稳定 ID；必须唯一 |
| `project` | 固定为 `examples/sidebar-tools/<id>`，不能是 URL、绝对路径或逃逸路径 |
| `kind` | 当前只接受 `sidebar-tool` |
| `installationPolicy` | `preinstalled`：仅在明确的新安装事件中可信宿主自动初始化；`optional`：用户在发现/市场中审阅后安装 |

`sourceRepository` 固定为本官方仓库 `https://github.com/shopable-ai/opendesk-browser`。源码 Catalog 不重复记录版本和能力，不包含用户安装、网站权限、运行实例、Cookie、密钥或本机目录。未知字段、重复 ID、不支持的策略、非受信来源和符号链接输入会使官方构建失败。`preinstalled` 仅在扩展自带可信源码和固定 SHA-256 发行资源中有意义，远端或本地导入的 JSON 不能获取该特权。

生成 schema 为 `opendesk.official-tools.releases.v1`，顶层只有 `schema`、`sourceRepository`、`apps`。每个发行项由经验证的实际包派生：

- `id`：`opendesk/<toolId>`，供市场识别来源。
- `toolId`、`kind`、`installationPolicy`：固定身份和已有运行类型。
- `version`、`packageTitle`、`description`、`capabilities`：来自实际 `tool.config.json` 和打包内容。
- `packagePath`：`official-tools/<toolId>/<toolId>.opendesk-tool.json`。
- `bytes`、`sha256`：最终文件原始 UTF-8 字节的长度和 SHA-256。

发行清单不是另一个安装数据库。摘要证明实际资源与可信目录一致；根信任来自已加载的可信扩展，不能把该摘要机制当作远程市场签名或抵御整个恶意扩展包的保证。

## 3. 确定性构建与持续开发

`scripts/build-official-tools.mjs` 读取可信登记，检查项目与声明输入，复用 `createSidebarToolPackage`、`validateSidebarToolPackage` 和规范化编码生成每个包。构建验证经典 JavaScript 语法、包身份、能力、UTF-8 字节预算与嵌入图片。输出没有时间戳、机器绝对路径或随机内容；临时落盘文件名不会进入产物。

全部包通过验证后才发布资源；包先写、Catalog 后写。源文件前后指纹不同则失败。`verify-package.mjs` 从同一可信源码重新生成并逐字节比较，保留既有封闭资源清单和体积预算；即使有人同时改了生成包与生成清单的摘要，也不能据此通过正式包验证。

```sh
# 按需生成单工具本地导入包
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc

# 按需检查整套官方资源的生成结果
node scripts/build-official-tools.mjs --out artifacts/official-tools-release

# 正式扩展自动生成官方资源，不需要 cp 或手工同步 JSON
npm run check
npm run build
npm run build:dev
npm run verify
```

`scripts/prepare-public.mjs` 为两种构建生成暂存资源；`scripts/build.mjs` 将 Catalog 及所有声明源文件纳入构建输入指纹。Chrome 运行时只读取固定扩展 JSON，不运行 Node/npm、不下载远程 JavaScript，也不把完整工具包导入 Service Worker 主 bundle。

`npm run dev` 复用现有 WXT 监听和发布队列：声明源码变化重新生成资源，目录结构变化先重新生成 public 再重启现有服务以刷新资源清单。无关 README/starter 事件不会吞掉有效更新；语法错误、缺文件和发布失败保留上一份就绪标记，其他静态资源的成功不能解除未修复的官方错误。已安装的旧工具仍保持原包，须在 UI 重新审阅并确认更新。

## 4. 四个独立状态

| 状态 | 权威事实 | 不隐含什么 |
| --- | --- | --- |
| Official Bundled | 扩展中存在通过验证的官方发行资源 | 不代表已安装 |
| Installed | 原 `SIDEBAR_TOOL_STORE` 中存在经过验证的包 | 不代表网站已批准，也不自动打开工具 |
| Site Authorized | 现有逐工具、逐 HTTP(S) origin 的专用授权存储 | 网站 A 不授权网站 B；不同 capability 不相互借权 |
| Active | 实际存活的工具 iframe，或已授权的可信网页组件 | 不能通过一个全局 `enabled` 布尔值推断 |

R4.5 原始合同不主动预装；R4.8 之后的当前首次安装策略以源码 Catalog 为准，七项工具中 TOC 和网页笔记预装，其余五项可选。预装不创建工具 iframe、运行工具代码或批准网站。安装 TOC 后，网页目录仍需独立网站授权；关闭 Side Panel 销毁工具 iframe，已经授权的网页组件按其原合同继续管理，撤权应立即清除相关网页能力。

## 5. 共用安装、升级和卸载

Side Panel 官方候选和扩展内市场都通过 `official-catalog.js` 读取固定资源，按字节上限、无重定向、UTF-8、SHA-256、ID、版本和能力校验后显示审核。确认提交前再次复核同一发行资源；缺失、篡改或审核内容不匹配时拒绝提交，不能用缓存包假装安装成功。

官方入口和本地文件最终调用 `src/ui/sidebar-tools/installation.js` 的 `installReviewedSidebarTool`，继续使用既有安装记录、Web Locks、审核基线、会话身份和权限合同。官方工具共用版本比较，显示安装、更新、已安装或已有较新版本。相同 ID 与版本本身不足以授予官方来源标识，还须规范化编码摘要一致。

- 确认前旧安装和私有数据继续有效，更新不会自动执行新包。
- 官方入口禁止降级及同版本不同内容替换；本地导入继续走原有明确风险确认。
- 历史本地/官方入口安装缺少来源记录时，升级需要明确的来源替换确认。已记录的冲突来源继续拒绝，不能凭 ID 自动认领。
- 新增能力仍明确审阅。网站许可只有在旧包和新包都具备相应能力时才能保留；不继承新增能力的孤儿授权。
- 多窗口确认在同一锁下复核审核时的包，过期批准失效；已消费批准不会因后续列表读取失败恢复可提交状态。
- 未知结果保留原事务并核对真实安装，不能自动重放；恢复必须绑定原工具 ID、固定版本和包摘要，不能用新版确认旧版事务。
- 安装记录写入回执丢失时，即使后来读到相同包，也先保留待核对状态；用户通过现有恢复入口核对本机包、原事务与来源。恢复只补齐已经批准的来源/事务元数据，不再次写入工具安装包、不运行 JavaScript、不批准网站。恢复在同一工具锁和 Catalog 锁中复核固定身份，等待锁期间身份改变则拒绝。
- 已有官方版本升级时，事务只记录经锁内包摘要核对的旧来源三字段快照（ID、版本、SHA-256）。新版已落盘但来源仍为旧版时，恢复只允许精确匹配该快照的来源推进；快照缺失、畸形或等待锁期间变化继续保留未知结果，不据此重装。
- 新安装或新增能力对应的残留网站授权必须在安装记录发布前清除并验证；清除失败不能使新包或新能力生效。升级写入失败时，旧包已有的有效授权与私有数据继续保留。
- 卸载沿用原数据与授权清理规则，删除相关来源记录、专属数据及应清理的会话资源。扩展重启或升级不会因为官方资源仍存在而重新安装。
- 卸载留下独立的实例撤销标记；同 ID、同版本、同内容重新安装后，旧 iframe 仍不能读写新实例数据。标记是会话安全元数据，不是安装记录，也不授予权限。
- 无安装记录但仍有旧私有数据时，安装会以 `E_TOOL_ORPHAN_DATA` 停止。有可信卸载恢复记录的，可通过「我的应用」完成原清理后重新审阅；没有该记录的，保留原数据并提示先备份核对，不承诺不存在的恢复按钮，不将安装确认视作删除数据授权。

并行存储治理已接入既有卸载恢复日志及「我的应用」恢复按钮。若安装记录已移除但清理未完成，保留待清理记录并明确报告失败；恢复再次持有同一组锁并核对 ID 当前未安装，避免陈旧清理删除重新安装的工具数据。它不是第二套安装数据库。大容量存储声明也不改变每个工具的数据上限、网站授权或运行实例合同。

资源路径变化不迁移或清空用户安装数据库。原有合法安装包、稳定工具 ID 和私有存储键继续有效。

## 6. 与市场 R2/R3 及未来系统功能的关系

[应用市场 R3 API](app-market-r3.zh-CN.md) 通过 `officialMarketApps` 从生成清单派生当前发行展示；市场模块仅维护可选展示文案和固定套装 revision。已发布 revision 的成员版本是不可变快照，不能跟随最新源码漂移；当前扩展没有某个固定版本时明确显示不可用。R2 原型 JSON 不作为生产发行目录，也不恢复用户网站权限或个人内容。

官方离线 Catalog 是受信来源解析的一种来源。R5 网站仅将固定候选交给扩展审阅，仍由这里的官方资源解析和原安装器执行；不增加工具数据库、沙箱或 Task / Page Program 验证合同。网页 URL 参数、普通 postMessage 和自称可信的代码不能取得安装权。

### R5 固定发行归档

`official-tools/releases/*.json` 从已有官方生产者或已绑定历史原始证据派生。构建合并归档和当前目录，拒绝同版本不同字节／元数据及同 revision 不同成员。追加发布使用 `npm run snapshot:market -- <新文件名.json>`，不能改写历史文件来使校验通过。当前推荐和固定历史路径分开；有历史页面不保证当前扩展包含其包。reading-kit r1、r2 原成员不变；网页笔记升级 1.1.8 后新增推荐 r3。缺完整发行证据的 quick-notes 1.1.1 只显示历史套装引用，不编造摘要。详见 [R5 网站架构](../architecture/browser-framework/app-market-website-r5.zh-CN.md)。

未来默认安装型系统功能的边界、一次性迁移标记和用户选择优先规则见 [市场兼容合同](../product/sidebar-tool-market-compat-r41.zh-CN.md#未来默认系统功能设计合同尚未实施)。该历史 R4.5 阶段的五工具全部 `optional`；当前策略已由上述原 Catalog 的2项预装、5项可选取代，继续使用原初始化/安装体系。

## 7. 验证入口

```sh
node --test tests/environment/official-tools-catalog-r45.test.mjs \
  tests/environment/sidebar-tools-host.test.mjs \
  tests/environment/app-market-r3.test.mjs \
  tests/environment/dev-service.test.mjs
```

真实 Chrome 复用 `tests/framework/app-market-r3-native.test.mjs` 和 `.github/workflows/app-market-r3.yml`，保留各工具原生专项驱动。精确候选、失败与成功证据、生产路径和未测边界记录在 [R4.5 专项 workstream](../framework/workstreams/official-tools-catalog-r45-20261011.md)。组件、构建、CI Chrome 受控网页、真实用户 Mac、线上网站及完整 F3/ZIP 安装分别判定。


## R4.8：预装与发现（2026-10-11）

- 当前可信源码声明：`reading-toc`、`quick-notes` 为 `preinstalled`；`web-markdown-clipper`、`markdown-workbench`、`knowledge-inbox` 为 `optional`。后续调整只需变更并审核 `official-tools/catalog.json`，构建时自动传播到发行清单。
- Service Worker 只在 `chrome.runtime.onInstalled` 的 `details.reason === "install"` 注册首次初始化意图，受信的固定后台资源立即复用安装器完成预装，Side Panel 在中断后负责幂等恢复（主 SW 仍受体积限制）。使用 `opendesk.sidebar-tools.bootstrap.v1` 记录版本固定的待办计划、进度与异常；这一标记**不是安装清单**。扩展升级及旧 Profile 不会静默补装。
- 真正的安装记录继续使用 `opendesk.sidebar-tools.installed.v1`。受信宿主通过 `loadOfficialCatalog/loadOfficialTool` 校验固定发行包，再使用现有 `installReviewedSidebarTool` 的锁、容量、写入读回、市场来源及事务恢复；没有新的安装器或旁路权限。
- 安装不执行 JS、不创建 iframe、不授权网站。阅读目录仅在用户明确操作中取得对应网站授权。已安装状态优先于市场异步加载；用户卸载产生的持久撤销代际和清理标记禁止初始化恢复重装。
- 读取到未知存储结果或冲突时，预装进度设为 `attention`，不盲目重试。普通安装/更新仍走用户确认；官方升级不绕过新增能力、来源差异或数据保护审阅。Side Panel 保留当前本机工具列表与图标触发的发现入口，不恢复旧版双层导航；完整应用市场仍管理版本、权限与恢复。

R4.5 的原候选证据保持原有身份，不因本页更新自动升级为 R4.8 的 Chrome 验收结果。参见 [本轮工作流](../framework/workstreams/sidebar-tools-default-preinstall-discovery-r48-20261011.md)。

## Time Review R1.2

`time-review` 始终为 `optional`，包能力为 `time.review` 与 `user.export`。复用现有候选安装、更新、停用和卸载流程；安装不等于授权计时。首次需包含 `time-review/time-review-host.js`、`alarms` 与可选 `idle` 的扩展构建。之后只改工具 UI 可用原打包器生成独立包。实际使用见 [Time Review](../../examples/sidebar-tools/time-review/README.zh-CN.md)，本轮组件和原生证据见 [专属工作流](../framework/workstreams/time-review-r12-01a12b0d.md)。
