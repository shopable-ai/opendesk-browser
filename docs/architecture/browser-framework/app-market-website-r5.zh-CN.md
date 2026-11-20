# OpenDesk 应用市场网站与可信安装交接 · R5

## 2026-11-20：签名发行索引与 Payload 接入（OD-MARKET-UPDATE-PAYLOAD-CONTRACT）

**原始目标：** 用户从原扩展列表打开独立外站；维护者发布固定工具版本后，用户仍在原列表检查、查看说明和权限变化，经原审阅与 Installer 原位更新，保留数据，并读回真实版本、来源和 SHA。下面是对既有网站、下载器和更新链的增量，不是第二个市场或安装器。

唯一机器合同是 [`docs/api/opendesk-market-update-v1.openapi.json`](../../api/opendesk-market-update-v1.openapi.json)。旧 `/api/opendesk-market/v1/update-index/stable` 和 `/api/market/v1/update-index/stable` 不是 HTTP 语法错误，但没有表达渠道资源的归属。对本轮基线 `3a9677ab403a83859bf088b2ca6d38799f857268` 的相关源码搜索未找到其真实消费者，本轮直接收敛为一个入口，不提供重定向别名。若以后发现独立部署的旧消费者，须单独核实并设计有截止条件的兼容，不能据此声称已迁移。

| 层次 | 唯一值或含义 |
| --- | --- |
| 公共 HTTP | `GET /api/market/v1/channels/stable/index` |
| OpenAPI | `/api/market/v1/channels/{channel}/index`；一期 `enum: [stable]` |
| `servers` | Origin 或 `/`，不重复加入 `/api` |
| Payload 根 Config `endpoints[].path` | `/market/v1/channels/:channel/index` |
| Payload 默认 `routes.api` | `/api`；不为单个市场接口修改全站前缀 |
| 路径含义 | `api` 接口入口，`market` 业务域，`v1` HTTP 合同版本，`stable` 发布渠道，`index` 完整发行快照 |

HTTP API 版本、签名 envelope schema、payload schema、快照 sequence、应用 version 和 Payload 软件版本独立。路径收敛不改 `opendesk.market.intent.v1`、`opendesk.market.signed-index.v1` 或 `opendesk.market.update-index.v1`。第一阶段仅 `opendesk-official` 来源、stable、Sidebar Tool，来源与类型进入受验证数据和可信客户端配置，不增加 publisher/type URL 层级。

### 当前源码调用关系与可宣称范围

原 `scripts/build-market-site.mjs` 接收已经签好的快照，核对签名、时效、已知 sequence、现有固定包原件及安全元数据，然后与网站一起生成。原 `scripts/serve-market-site.mjs` 在静态资源分派前调用 `scripts/market-index-response.mjs`，直接返回存储的 envelope 原始字节。索引读取、验签和本地比较由 `src/marketplace/update-index.js` / `update-discovery.js` 接入原 Worker 更新服务；原列表仍消费原 Store，安装仍使用原下载器和 Installer。具体接线与未测项以当前源码、定向测试和本轮交付记录为准；只有 URL 修订不算已接线。

`/catalog.json` 继续用于外站展示；以下六字段固定 descriptor 和包仍在 `/api` 之外：

- `/releases/opendesk/{toolId}/{version}/descriptor.json`
- `/releases/opendesk/{toolId}/{version}/package.opendesk-tool.json`

descriptor 严格保持 `schema、marketId、version、bytes、sha256、packagePath`。包内 ID、版本、能力、运行需求和规范字节须与索引、descriptor 对齐；市场页面不能提供任意下载 URL。对象存储可在批准市场 Origin 后通过同源代理响应，不能要求当前下载器跟随 S3 跨源重定向。

### HTTP、快照与缓存

| 状态 | 语义 |
| --- | --- |
| 200 | 完整、当前有效的已存储签名快照，`application/json`，直接响应，无重定向 |
| 304 | 服务器也先验证当前快照；客户端只复用尚未过期且已验证的同一快照 |
| 404 | 不支持的渠道或索引路由，无 stable 回落 |
| 429 | 限流，带有界 `Retry-After`；部署方接入 limiter 或受控代理 |
| 503 | 快照不存在、无可信密钥、签名/时效不合法、读取超时或服务未就绪；不返回成功空列表 |

静态适配器输出强 ETag 和 `Cache-Control: public, max-age=0, must-revalidate`。ETag 只描述缓存字节，不能续签或证明全网最新。快照读入上限 1 MiB，服务等待上限 5 秒；客户端另有自己的有界网络预算和 payload/条目限制。完整指当次可选择发行及明确撤回，不是无界历史；缺少旧安装不代表最新、撤回或应卸载。`where/depth/page` 等参数不改变返回的签名清单，不能分页拼接。

`/index` 是扩展名为空的资源，必须明确 JSON MIME。原开发服务拥有 `/api/market/v1/` 路径，错误不会落回 HTML。静态平台的 `_headers` 只是一份配置输入，不能独自实现过期检查、304、503、未知渠道与限流；生产必须将这个接口交给同合同的响应器/Route Handler/同源代理。不能只上传一个文件就声称 API 已部署。实测必须包含 `basePath`、`trailingSlash` 和代理转发，确保没有 `/api/api`、额外 Collection/Global slug、HTML fallback 或 301/302/307/308。

跨域消费时显式配置允许 Origin；响应器支持 OPTIONS、`If-None-Match` 预检与暴露 `ETag, Retry-After`，不启用凭据。CORS 只约束浏览器读取，不构成发布源信任、签名授权或安装批准。

### 当前构建与本地 HTTP 入口

使用原构建函数的 `signedUpdateIndex`（原始 UTF-8 字节）和 `updatePublicKeys`（`keyId → 标准 Base64 的 32 字节 Ed25519 公钥`），或原 CLI 的两个输入文件：

```bash
OPENDESK_MARKET_SIGNED_INDEX_FILE=/absolute/path/stable.signed.json \
OPENDESK_MARKET_UPDATE_KEYS_FILE=/absolute/path/trusted-public-keys.json \
npm run dev:market
```

上述路径是维护者提供的输入示意，不是本仓库已有生产密钥或已发布制品。签名由 `scripts/sign-market-update-index.mjs` 在离线发布步骤生成，网站构建器不接收私钥、不自动生成生产信任根。扩展的可信公钥配置必须另经批准并进入本体构建；网站给出的公钥不能自授权客户端。

离线签名命令如下；payload 是符合唯一 OpenAPI 的完整快照原始 UTF-8 文件，输出文件必须尚不存在。签名器保留该 payload 的精确字节，并用派生公钥自验后输出 envelope；它不上传文件或切换发布渠道。

```bash
node scripts/sign-market-update-index.mjs \
  --payload /absolute/path/stable.payload.json \
  --private-key /absolute/path/release-signing-key.pem \
  --key-id MAINTAINER_CONFIGURED_KEY_ID \
  --out /absolute/path/new-stable.signed.json
```

`OPENDESK_MARKET_INDEX_CORS_ORIGINS` 可给开发服务提供显式 Origin JSON 数组。`OPENDESK_MARKET_PROJECTS` 继续沿用现有独立项目构建输入。单独运行 `npm run build:market-site` 时也可以传入上述两个签名相关环境变量；仅构建不启动 HTTP 服务。

构建验证每条 published 发行在本次输出中有对应原件，核对大小、SHA、六字段 descriptor、真实标题/描述/能力/运行需求后才写索引；withdrawn 可保留无可下载原件的明确撤回。已有签名渠道不能被一次无签名重建静默移除。对上一份已验证输出检查 sequence、同序号 payload 冲突以及已知同版本安全身份冲突；过期旧快照只可在签名验证后用于历史比较，绝不用于 200/304。无法验证旧密钥时失败并保留旧输出。它不是完整历史发行账本，不能声称检测了没有留存证据的全部历史冲突。

全部输入验证后才替换输出目录，失败保留原输出，替换过程不暴露半份快照；如目录切换间资源暂时缺失，索引准确返回 503。构建时和最后替换前再次核对签名输入与有效期。部署端仍需独立完成发布指针的原子更新。

### Payload 的实际状态和接入设计

本轮基线的 `package.json`、锁文件与市场服务没有 Payload/Next 依赖，也没有实际 Payload `routes.api`、Next `basePath` / `trailingSlash` 或生产代理配置。因此**没有可声称已安装的 Payload 软件版本或已验证的 Payload HTTP 部署**。设计依据是 [Payload 当前 REST API / Custom Endpoints 官方文档](https://payloadcms.com/docs/rest-api/overview#custom-endpoints) 和 [3.0 迁移文档](https://payloadcms.com/docs/migration-guide/overview)：采用根 Config 的端点、Web Request/Response 形态；实现前须锁定真实 Payload 版本及部署参数再联调，不把示例当部署事实。

根 Config 在默认 `/api` 下注册 `/market/v1/channels/:channel/index`，handler 读取已发布不可变快照并调用相同响应合同。不要放入某个 Collection/Global，避免追加 slug；不要修改全站 API prefix。根路径 catalog/releases 继续由静态服务、同源代理或独立 Next Route Handler 提供。Payload 自定义端点不会自动加 CORS 响应头，应按实际版本使用官方 `headersWithCors` 或同合同显式头，并验证 OPTIONS 和条件请求。

Payload 后台分别管理应用资料、软件 release、不可变制品元数据、已签名快照与渠道当前指针；CMS Versions/Drafts 只管理编辑历史，不等于软件发行版本。公开 GET 只取渠道指针引用的已签名快照，不查询或返回管理员会话、草稿及任意分页 CRUD 结果。不能把登录态作为安装合同。

发布顺序是：准备固定原件 → 上传并从批准同源读回验证 → 生成完整 payload → 离线签名并验签 → 保存不可变快照 → 在数据库事务中按预期 sequence 原子切换渠道指针。数据库事务不覆盖对象存储上传；上传或验证失败时不切换指针。撤回/回滚发布也采用更高 sequence 的新快照，不回退 sequence。私钥不作为公开 CMS 字段，不从索引或网页动态添加可信公钥。

### 验收边界与下一条用户操作

本轮补齐了实际调用断点：在线完整发行可以通过原 `openOfficialReview` 进入审阅，不再要求随包目录已有同一新版本。缺失旧 provenance 或来源身份不一致时，原界面明确展示来源替换；UI 与 Installer 共用完整来源记录校验。权限变更仍由原审阅处理，来源更换不继承敏感授权，也不误删用户的站点拒绝记录。

最后一次 fresh 核验后，Installer 在原工具/目录锁内短暂取得原 `UPDATE_NOTICE_LOCK`，重新比较 Worker 核验票据与持久快照的 sequence、原 payload SHA、来源、渠道和时效，再记录原事务首写。网络不在该短锁内；已被本机接受的新撤回快照会阻止旧审阅开始事务。UNKNOWN 恢复绑定原 operationId，不重下载、不重放安装。

显式 fresh 检查失败后，被动缓存读取不会清掉失败提示或推进成功核验时间，只有实际 fresh 成功才清除。该失败记录目前只在 Worker 生命周期内锁存；重启可重新验证尚未过期的签名缓存。`lastVerifiedAt` 是本机核验时间，不是全网最新证明。历史身份记录达到 4096 条、展示状态达到安全容量时明确失败，不以截断伪造成功。

### 本轮最终验证与独立审查（2026-11-20）

基线为 `main@3a9677ab403a83859bf088b2ca6d38799f857268`，本节描述包含这些变更的 Git 候选。是否交付到远端，以实际 commit 和远端 `main` 引用为准；本文不能代替推送证据。没有继承旧临时工作区的“88 PASS”，没有运行全仓 `npm test` 或把历史 Chrome 回执绑定到本候选。

| 层次 | 实际结果 | 证据边界 |
| --- | --- | --- |
| 协议、更新服务、Store、UI、签名发现、原安装器、HTTP/构建、安全与 Page companion 定向验证 | 213 / 213 PASS | 下列 14 个测试文件的同一最终候选运行；Chrome storage/锁等由测试适配 |
| 原 Host 在线审阅及 UNKNOWN 恢复 | 4 / 4 PASS | 真实 Host 模块；Worker 回执与浏览器环境为适配器 |
| 原 app-shell 受影响行为 | 2 / 2 PASS | SSR/组件证据，不是原生 Chrome |
| 唯一用例合计 | **219 / 219 PASS，0 FAIL、0 SKIPPED** | 不累加之前重复运行及独立复核的重叠用例 |
| localhost HTTP 联调 | PASS | 实际 TCP、原服务子进程、200/304/404/429/503、无重定向；并有真实签名→Worker→下载器→Installer 数据保留回读 |
| 真实 Chrome 原位更新 | **NOT_TESTED** | 尚无本候选的真实点击、权限、Registry/provenance/SHA/原数据回读 |
| Payload 运行与生产部署 | **NOT_TESTED** | 未安装 Payload；生产 channel 与客户端签名公钥仍未配置 |

可复现的定向命令（仓库根目录，依赖沿用锁文件）：

```bash
node --test --test-concurrency=1 \
  tests/environment/update-notice-state.test.mjs \
  tests/environment/update-notice-service.test.mjs \
  tests/environment/extension-inline-update-r4.test.mjs \
  tests/environment/market-panel-navigation-r691.test.mjs \
  tests/environment/market-update-contract.test.mjs \
  tests/environment/update-notice-ui.test.mjs \
  tests/environment/extension-inline-update-visibility.test.mjs \
  tests/environment/market-update-discovery.test.mjs \
  tests/environment/market-trusted-install.test.mjs \
  tests/environment/market-update-http.test.mjs \
  tests/environment/market-dynamic-site.test.mjs \
  tests/environment/market-update-security.test.mjs \
  tests/environment/sidebar-tool-page-module-install.test.mjs \
  tests/environment/market-update-admission-audit.test.mjs
node --test --test-name-pattern='online update Host' \
  tests/environment/sidebar-tools-host.test.mjs
node --test --test-name-pattern='app.html SSR|standalone app' \
  tests/environment/react-sidebar-app-shell-r351.test.mjs
```

本次执行工作区原始日志为 `artifacts/market-update-payload-contract/final-candidate.tap`、`final-host.tap`、`final-app-shell.tap`；日志遵循原忽略规则，不随源码提交。独立签名竞态用例确实在旧实现失败、修复后通过；不能将其内存浏览器适配器称为 Chrome 实机。

另有已记录失败，未伪装成全仓通过：`marketplace-source-review.test.mjs` 的 9 条旧内置市场 UI 测试在本候选和只读加载的基线 main 均失败；没有为此恢复已退役 UI。一次误选的 `app-page-programs.test.mjs` 额外运行出现 40 条失败，代表性的 `preview.beginInstalledAllocation is not a function` 在基线复现，其余未逐项归因；没有扩大本任务去修该 Page 框架。它们不计入上述 219 条定向通过，也不构成全仓绿色声明。

三个评审者分别独立读取最终相关源码；没有参与对应生产实现。以下为**独立 AI 设计审查**，不是外部人工认证或产品验收。随后 API 与安全视角进行了反方复现，实际修复了 fresh 失败被旧缓存清除、同字节来源漂移、原审阅只选随包旧版、原 UNKNOWN 身份错配、敏感授权迁移、当前受阻状态被历史裁剪，以及事务开始前已接受撤回仍可安装等问题；当前已发现的 P0/P1 无未决项。

| 独立视角 | 最终评分 | 剩余条件与扣分依据 |
| --- | ---: | --- |
| API / 架构 | 96 / 100 | fresh 失败历史仅内存；Payload 部署参数、生产密钥轮换/历史容量恢复、固定 Host 依赖矩阵尚未实证，各扣 1 |
| Payload / 数据 / 部署 | 96 / 100 | 实际版本、生产代理/CORS/限流、对象存储与数据库发布切换、生产信任根/轮换，各扣 1 |
| 安装安全 / 生命周期 | 96 / 100 | Chrome 多窗/Worker/存储时序扣 2；原生授权迁移和真实数据回读扣 1；生产来源与签名者未验扣 1 |
| 算术平均 | **(96 + 96 + 96) / 3 = 96 / 100** | 设计达标不替代 HTTP、Chrome 或部署验收 |

当前生产 channel 仍为空；Payload 运行、真实 Chrome 旧版→新版更新和生产部署须分别记录为 `NOT_TESTED`，不能由设计分、构建或 Node 回执替代。下一条原生验收是：一个可独立更新的官方工具，原列表检查 → 原审阅更新 → 从真实 Registry/provenance/回执读回新版本、来源、SHA → 重开工具核对原数据。没有来源证据不得补造，UNKNOWN 沿原事务核对；检查失败不能阻止旧安装按原授权使用。

### 本地 Codex 接续：先验收这一份实现，按证据修复

下面的任务在包含本节的代码已经同步到本地 `main` 后执行。不要把重新设计接口或再写一份协议作为验收前置。

```text
任务：OD-MARKET-UPDATE-PAYLOAD-CONTRACT 的真实本地验收与必要修复。
仓库：shopable-ai/opendesk-browser；只用 main，不创建分支、worktree、PR。

1. 读取实际 AGENTS.md、当前 main SHA、git status 和本文件 2026-11-20 章节。
   保留本机并行改动；不要 reset/clean/覆盖已有 watcher、Chrome Profile 或生产配置。
   若本地没有上述签名发现与原 Installer 接线，先核对远端 main 和交付 commit，
   不假定它已经存在，不用旧临时 ZIP 或上轮88 PASS替代当前源码。

2. 以 docs/api/opendesk-market-update-v1.openapi.json 为唯一合同。
   API 只用 /api/market/v1/channels/stable/index；固定六字段 descriptor、
   原 intent v1、Page/Controller 各自安装合同保持兼容。
   先核对相关输入与本节219项证据；有相关差异时只重跑受影响组，失败先定位再修。

3. 核对现有 Chrome 实际加载目录、扩展ID、Worker、开发服务及构建指纹。
   遵守仓库真实浏览器资源占用规则；日常开发沿用原 npm run dev，
   隔离验收沿用已有 CFT/Profile 流程，不替换用户日常扩展。

4. 生产 channel 和 MARKET_UPDATE_PUBLIC_KEYS 尚未配置，这是明确未完成条件。
   若已有经核验的开发公钥/签名快照，复用它；否则生成只用于本地验收的独立密钥，
   私钥留在仓库外，并在受控的本地开发构建中明确配置该公钥和批准的市场同源。
   不从 HTTP、CMS 登录态或 localStorage 自动建立信任，不提交测试私钥，
   不改生产信任根。记录并在结束时恢复自己临时的测试信任配置。

5. 选择一项真实可独立更新的官方 Sidebar Tool，准备原打包器生成的旧/新固定发行。
   新版必须确实只依赖当前可验证的 Browser SDK/Host；需要固定代码更新时，
   显示“需更新Browser/兼容性待核对”，不通过改 contractHash 强行放行。
   先安装旧版并写入可复核的测试数据，记录版本、来源、SHA和安装epoch。
   通过原构建器、离线签名器和原市场HTTP服务提供新快照及同源原件。

6. 在真实原扩展列表执行：打开商店 → 检查更新 → 查看新版本说明、来源与权限变化
   → 原审阅确认 → 原 Installer 更新。读回真实 Registry、provenance、操作回执，
   验证新版本/完整来源/SHA、原数据与原工具仍可使用，保留候选SHA和原始回执。
   先验证取消确实不改变安装；UNKNOWN只能核对原 operationId，不能重放。

7. 对本次实际改动做必要故障验证：坏签名、过期、未知渠道、检查离线、有效/过期304、
   迟到低sequence及已接受撤回；检查失败不能显示最新，旧安装继续按原授权使用。
   可以复用本节源码/HTTP回归，但不要将适配器结果冒充真实Chrome故障验收。

8. 发现本链实际缺陷就沿现有模块最小修复并补定向回归，复验后更新本文件同一记录。
   不建立第二个市场/Installer/后端，不扩展到支付、评价、第三方作者或静默批量升级。
   Payload没有部署时，只确认接入合同；实际Payload/代理/生产发布仍标NOT_TESTED。

9. 最终分别报告：代码与候选SHA、定向测试、真实HTTP、真实Chrome、Payload、生产。
   给出测试前后版本/来源/SHA/数据的原始证据和未完成原因，不以设计96分替代验收。
   commit/push按该本地会话明确授权与仓库规则办理，不自动发布生产。
```

## 2026-11-10：VIP-only 网页市场接续与开发 SQLite Provider（增量，非生产发行）

**边界：** 不改 `opendesk.market.intent.v1`、Source Policy、原 Market Host、原安装器、官方 Catalog 安装身份；后续实机证明必要的通用app.html修复见第13节。网页市场现有静态发布/固定发行继续沿用 `scripts/build-market-site.mjs`；它现在同时输出受控 `vip-continuation.js`。只有 `opendesk/ai-vip-share` 的网站客户端会读取当前已安装状态并尝试复用原 `OPEN_INSTALLED_APP`。同页合法开发 `#vip-ref` 从不交给扩展安装协议；挂起安装只保存原 `intentId` 和参考摘要，安装确认后必须经 Host `APP_OPENED` 才导航到固定的 `127.0.0.1:7898/activate`，然后由工具内原业务 Controller 执行预检和一次确认。取消、过期、未知和面板未打开不自动重复安装或领取。

**实际未上线原因：** 1.4.34已同源晋升并经原审阅实际安装，开发实机核心链DEMO_PASS；正式 HTTPS Market channel 与 Web Store ID 未配置，商业 Provider 未配置。本轮新增的 `projects/ai-vip-share/server/demo-provider.mjs` 是独立的 *业务 owner* 下本地 SQLite 演示服务，不是通用 Market Server，不处理安装许可、Cookie 或生产权益。只有数据库级约束可作为开发事务基础，不能把演示 Origin/header 当生产认证。固定发行是否允许打开以原 Host 的 descriptor/本机 provenance 校验为准；不因新网页代码而跳过。

**本轮定向验证入口**：`node --test tests/environment/market-vip-continuation.test.mjs tests/environment/market-site-client-r5.test.mjs projects/ai-vip-share/tests/demo-provider.test.mjs`；`npm run build:market-site`；运行/构建/原生 Chrome 的实际结果见 [原 R5 工作流](../../framework/workstreams/app-market-r5.md) 和 [VIP 唯一验收账本](../../../projects/ai-vip-share/dev/local-test/EXTENSION-VIP-TEST.zh-CN.md)。未取到原始运行回执前一律 `NOT_TESTED`；R5 历史 Chrome 实证只证明其原候选，不是本次接续真实通过。


日期：2026-10-12。实现入口及逐项结果见 [R5 工作流](../../framework/workstreams/app-market-r5.md)。本文描述已写入源码的合同；源码、组件、真实 Chrome、本机 Mac 与正式 HTTPS 的完成状态分别记录，不能互相替代。

## 2026-10-31：网页市场独立运行与浏览器内安装

网页市场无需安装、启动、连接或配对 OpenDesk 桌面应用。正常浏览、搜索与查看详情不探测接收方，不显示通用连接状态或重连按钮。应用按钮为“安装到浏览器”；安装时需要同一 Chrome Profile 中已安装并启用的 **OpenDesk Browser 浏览器扩展**。缺少接收方时在该次操作处说明浏览器扩展要求，本地扩展 ID 只放在帮助页的开发诊断详情。

单应用沿用 `chrome.runtime.sendMessage` → 原 `onMessageExternal` 来源与文档校验 → Chrome Side Panel 可信 React 审阅 → 固定版本 descriptor/包摘要核验 → 原 `installReviewedSidebarTool`、存储及事务回执 → 主动打开使用。这里的浏览器原生侧栏不代表 Native Messaging；通用安装链路不以桌面应用、Go、Native Messaging 或本地 Provider 为前置条件。应用打开后的特定业务能力仍遵守各自授权与依赖。

网页没有安装批准权。打开面板不等于确认，取消不提交安装；超时保留原 intent，只查询回执或由用户返回同一审阅。刷新与焦点恢复仅恢复未结束的原事务，不自动重新打开或重放安装。显式操作重新读取通道配置，接收方或配置失效不能沿用旧目标；服务端诊断用的 `PROBE` 协议保留，普通网页客户端不再发送它。

构建为外部客户端脚本 URL 添加内容摘要，避免新 HTML 搭配缓存旧脚本继续显示旧连接流程。下文 R5 候选与 CI 是历史证据，不能代替本轮结果，也不能成为普通用户安装桌面软件的前置步骤。

本轮本机核心验证：`http://127.0.0.1:43132/` 已实际更新，147 个文件摘要与部署身份匹配，107 个页面移除连接控件；原 catalog 与 26 个固定发行资源保持字节不变。网页 build ID 为 `085a6b654e39c606ed527d5be2b2e7a3a9f9094ac4165ece6af7c8127a2b8a7e`，客户端、模板、来源与事务恢复相关检查 54/54 PASS。既有 Chrome 扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf` 加载 `dist/development`，本轮未重建或重载扩展，也未重启网站服务；该扩展没有持续开发连接的证明。

真实 Chrome 使用更新后的网页完成：网页笔记审阅 → 取消并显示“已取消，未提交安装” → 显式新审阅 → 确认从 v1.0.0 更新到 v1.1.10 → 打开使用 → 保存专用本机笔记 → 列表回读 1 条。网页分别取得取消与成功事务回执。未操作桌面软件或 Native 配对；源码已确认通用链路无此依赖，但未强制关闭 Native 服务做故障试验。生产/HTTPS、全部当前工具源码重新发行、全仓及对抗验收均未执行。原始本机回执与截图位于 `artifacts/market-browser-install-20261031/`，不作为正式发布证据。

## 实施与验证状态（2026-10-12）

受测候选 `3744be088240124d3ab803ef10c2c0256e787b37` 的 [Linux/macOS R5 HTTP 原生安装和生产包验收](https://github.com/shopable-ai/opendesk-browser/actions/runs/38237391020) 三个作业均通过。Linux/macOS 各 16 个专项场景覆盖官网交接、可信审阅、安装、工具真实使用、固定版本与套装、五秒超时、错误请求拒绝、A1/A2/B/C 中断恢复、用户数据保留及 Chrome 正常重启。实际证据的扩展 ID、版本、包、网页 build 和未测边界见 [R5 机器索引](../../framework/workstreams/evidence/app-market-r5/ci-38237391020/index.json) 与 [R5 工作流](../../framework/workstreams/app-market-r5.md)。

这证明的是**该候选的本地 HTTP 闭环**，不是正式官网已上线或后续变更后的 `main` 自动验收。之后 `main` 对 Worker 定时唤醒、Browser SDK 能力、工具页和 Side Panel 进行了并行修改，必须按 `AFFECTED_INPUTS` 复查新的构建与受影响的原生链路。正式 HTTPS 缺经核验的 Origin、发行扩展 ID、获取链接及部署前提，保持 `BLOCKED`。真实 Chrome API 回执丢失、配额不足、完整 30 分钟 TTL 和自然空闲关停等仍是独立 `NOT_TESTED`，不能与本轮物理中断等同。

### 最新双平台安装候选（2026-10-12）
固定 `608ed7c1a36ae878fa70f45339ffb0e68e054398` 的 [Linux/macOS HTTP 真实安装及生产原生回归](https://github.com/shopable-ai/opendesk-browser/actions/runs/38269315702) 全部通过，覆盖原网站点击、受控来源、扩展固定候选审阅、安装、主动打开、真实工具使用、固定套装、A1/A2/B/C 中断恢复、用户数据保留和浏览器完整重启。此候选亦合入 Native Workspace SVG 文件树修复和共享 Developer 编译器资源测试基线；静态网站与扩展均按相同候选编译和验证。

真实结果身份与独立维度分数见 [本候选机器证据索引](../../framework/workstreams/evidence/app-market-r5/ci-38269315702/index.json) 和 [持续工作流](../../framework/workstreams/app-market-r5.md)。**只对这一源码候选和实际 CI 浏览器环境承认 PASSED**；正式 HTTPS、Chrome API 本身 ACK 丢失、真实配额故障及完整自然过期仍分别 `BLOCKED`／`NOT_TESTED`。既有随包官方安装是已通过的 R5 范围；远程 Page/Task 整包发行仍由各自独立签名及准入任务负责。

## 1. 本轮固定范围与路线

交付范围在实施开始时固定为：独立网站源码和完整构建、官方固定发行的受限交接、一次可信审阅、本地 HTTP 安装及实际使用、必要恢复、开发／生产隔离、版本归档、可部署产物及正式渠道合同。真实安装、使用和恢复是验收要求，不因环境受限而改称后续功能。未完成的证据必须在工作流保留 `BLOCKED`／`NOT_TESTED`。

| 机制 | 用户与更新 | 现有能力复用 | 来源、恢复与维护 | 本轮取舍 |
| --- | --- | --- | --- | --- |
| 网站发现 → 扩展内官方包审阅 | 网站点击、扩展审阅一次、安装后主动打开；官方包更新随扩展发版 | 直接复用现有 Catalog、安装器、存储、权限、沙箱和恢复 | 发行字节来自用户安装的扩展；可离线安装；不新增远程代码供应链 | 本轮实现的端到端路径 |
| 已准入类型的远程固定版本整包 | 应用可独立更新；仍须各类型审阅和准入 | 可复用固定身份和安装提交，但缺少整包分发的发布者信任根 | 需签名、密钥轮换、撤回、制品限额、缓存和故障恢复；Chrome 政策按执行位置分别审查 | 保留独立增量任务，不通过外部消息传 URL 偷渡 |
| 核心随扩展、适合类型独立分发 | 核心宿主稳定，应用按自身合同演进 | 保留 Authority、Broker、RunHost、SDK 及 Page／Task 准入 | 单一安装事实，多个经批准的制品来源；不建第二套权限或执行框架 | 采用此长期架构，本轮先完成第一行 |

网页用户脚本分发可参考 Tampermonkey／Greasy Fork，但 OpenDesk 的 Sidebar、Page 和 Task 运行位置及能力不同，不统一改成 `.user.js`。VS Code 市场中固定版本、兼容性、安装与启用分离的机制可参考，不复制它的权限或运行模型。

## 2. 源码与权威边界

| 内容 | 唯一入口与职责 |
| --- | --- |
| 官方源码登记 | `official-tools/catalog.json`；登记项目、ID、类型和预装策略，不重复记录版本或用户状态 |
| 发行生产者 | `scripts/build-official-tools.mjs`；由原项目生成包、字节数及 SHA-256 |
| 网站展示 | `src/market-site/templates.mjs`、`market.css`、`client.js`；引用共享市场纯数据和 `src/ui/design-tokens.css` |
| 网站构建 | `scripts/build-market-site.mjs`；输入校验、路由、归档合并、完整输出和身份，不承载整页模板／CSS |
| 来源配置 | `src/marketplace/channel-config.json` → `scripts/market-channel.mjs`；同源生成网站配置、Manifest 和扩展私有配置 |
| 外部入口 | `src/entrypoints/market-host.js` → `src/marketplace/external.js`；Service Worker 固定本地 sidecar，只处理连接和打开审阅 |
| 交接元数据 | `src/marketplace/intent.js`；使用现有 `chrome.storage.local`，不是已安装应用数据库 |
| 可信审阅 | `src/marketplace/page.js`；复用现有单应用和批量审阅、基线、原事务与恢复 |
| 实际安装事实 | `src/ui/sidebar-tools/installation.js` 和既有工具存储；网站与 intent 不保存第二份安装状态 |

网站不引入扩展完整 `page.js`、安装器、SDK、权限处理或用户存储；Service Worker 不引入网站搜索、HTML、CSS 或前端依赖。WAR 仍只开放已有固定 SDK 资源，审阅页、channel 配置和安装记录不公开给网页。

## 3. 独立网站与构建身份

默认 `npm run build:market-site` 在没有任何旧 dist 输入时即可构建 `dist/app-market-public`。输入包括原官方生产者及源码、受控发行快照、套装纯数据、模板、样式、客户端、设计 token 和来源配置；构建前后核对输入未变化。

生成：首页和应用列表、搜索及三个实际分类、当前推荐详情、固定版本详情、套装列表及固定 revision、安装交接说明、主扩展／连接帮助、404、robots、sitemap、逐页 title／description／OG／canonical。每个分享路径都有实际 `index.html`，不依赖服务端 SPA fallback。当前推荐路径与固定版本路径分开。

完整产物先生成到唯一临时目录，通过后替换已识别的网站产物；不读取旧网站页面，不把扩展包目录当网站目录，不覆盖未经识别的用户目录。`site-build.json` 记录 source inputs、输出文件 hash、目录身份、构建模式、真实配置及 build ID；它不包含安装清单或用户数据。当前公开目录包含经原构建器验证的固定工具 JSON 包，沿 `/releases/opendesk/{toolId}/{version}/` 分发；网页不会执行这些包，安装继续由扩展原可信链完成。

源模板对动态文本及属性转义；客户端只使用文本和固定 DOM 更新。无第三方脚本、远程字体、分析 SDK、Cookie 或用户上传执行入口。真实截图只接受仓库受控 PNG；没有媒体时不把结构示意冒充实际截图。截图及响应式实测是否完成以工作流为准。

`src/market-site/media-index.json` 只登记展示图片来源：应用固定版本、图片 SHA-256、对应发行制品 SHA-256、源码提交、真实 Chrome 版本、CI run/artifact 与原始截图路径。它不是应用登记或安装事实。构建拒绝缺登记的图片、缺文件的登记、版本/制品不符、重复图片、字节被改动和超限尺寸；从 PNG IHDR 读取真实宽高，不写虚构比例。`site-build.json` 同时绑定这些展示输入。详情图注明独立工具页/Side Panel/授权网页，以及实际初始或使用状态，并提供完整原图；“初始编辑界面”不能改称已输入示例成果。单张真实截图也不能把其所属失败运行提升为整套通过。

## 4. 开发与生产来源

配置协议为 `opendesk.market.channel-source.v1`，安装协议固定 `opendesk.market.intent.v1`。

| 字段 | 开发 | 生产 |
| --- | --- | --- |
| Origin | 默认 `http://127.0.0.1:43132`，必须显式端口且仅 loopback | 一个经核验的公共 HTTPS Origin，443，拒绝路径、凭据、query、片段、开发域和 IP |
| 扩展 ID | 明确配置，或从实际解压目录生成预期 ID；浏览器验收须比对实际 ID | 固定发行 ID，不能沿用开发目录 ID |
| 获取地址 | 不编造正式发行地址；说明加载 `dist/development` | 核验同 ID 的正式 Chrome Web Store 地址及核验日期 |
| Manifest | 精确开发 Origin 的 matches | 精确 HTTPS Origin 和 443；正式配置为空则没有 externally_connectable |
| 状态 | 仅开发构建可用 | 四项生产输入全为空表示禁用，部分填写或无效配置直接构建失败 |

开发环境可使用 `OPENDESK_MARKET_DEV_ORIGIN`、`OPENDESK_MARKET_DEV_EXTENSION_ID`，并须同时重建扩展和网站。生产解析忽略这些开发变量，不能因运行 shell 留有开发值而开放 HTTP。`OPENDESK_MARKET_SITE_ORIGIN` 只表达部署 metadata；它不会授予安装信任，且启用交接时必须与受控 Origin 相同。

目前正式域名、生产发行 ID、经核验获取地址均未提供，源码中为 `null`。这是一份可审查的配置合同，不是已发布渠道。生产生成器和包校验拒绝未授权来源，不使用占位地址冒充上线。

生产禁用通道的真实工具生命周期与“已配置 HTTPS `:443/*` 的 Chrome 外部交接”是不同证据。后者在真实正式输入和部署到位前保留 `configured-production-manifest-real-chrome: NOT_TESTED`／渠道阶段 `BLOCKED`。

## 5. 仅两个外部操作

连接探测只接受：

```json
{"protocol":"opendesk.market.intent.v1","action":"PROBE"}
```

应用交接只接受：

```json
{"protocol":"opendesk.market.intent.v1","action":"OPEN_INSTALL_REVIEW","intentId":"5318f787-c7f5-4306-8f27-4a1c627d1b63","subject":{"kind":"app","marketId":"opendesk/markdown-workbench","version":"1.0.1"}}
```

套装 subject 为 `{"kind":"collection","collectionId":"reading-kit","revision":2}`。UUID、ID、版本长度和 revision 范围均有界；未知字段、嵌套额外字段、任意代码、包 URL、运行命令、跳转地址、权限批准和用户数据一律拒绝。先检验字段及廉价 sender 身份，再进入有上限的处理队列。

网页使用 Chrome 官方 `chrome.runtime.sendMessage(extensionId, payload)`。后台独立注册 `onMessageExternal`，保留 `return true`／`sendResponse` 异步兼容方式，不转发内部 RPC、SDK、Cloud Control 或 RunHost。

网页只会收到 `CONNECTED` 或 `REVIEW_OPENED` 等交接结果和有限错误码，不会收到已安装清单、用户信息或批准权。连接 5 秒超时显示“无法连接 OpenDesk”，不能断言主扩展未安装。交接成功只显示审阅页已打开；安装成功必须由可信页读取本机实际结果。

## 6. 浏览器提供的发送者验证

必须同时满足：实际 runtime ID 与配置一致；sender 没有扩展／Native 来源身份；`frameId === 0`；有效非隐身 tab；浏览器提供的非零 32 位十六进制 `documentId` 和 `documentLifecycle === active`；精确 sender Origin、URL、端口。URL 拒绝凭据及过长值。Chrome 的 `documentId` 是浏览器 `UnguessableToken` 的表示，与本协议 intent／review UUID 和 Chrome `contextId` UUID 不同，不共用 UUID 正则。

随后使用 `tabs.get` 和 `webNavigation.getFrame({tabId, documentId})` 核对实际 tab 当前／待导航 URL、活跃顶层 document、`parentFrameId === -1`、document ID 与 URL。请求正文不提供 sender，无法以自报字段替代这些检查。缺字段或浏览器条件不支持时拒绝，并返回可理解的错误。跨来源、错误端口、iframe、扩展来源和隐身请求不进入开页及安装逻辑。

浏览器校验与当前文档观察存在正常异步窗口；已经验证并持久化的固定意图是本地审阅记录，不需要官网继续打开。官网关闭或导航不会让另一应用替换用户审阅的对象。

## 7. 去重、限流、开页与恢复

意图键为 `opendesk.market.intents.v1`，最多 64 项，TTL 30 分钟。只记录 request/subject/review/operation 身份、来源、时间、开页状态、消费及结束状态。它没有包、权限、用户数据或“已安装”字段。

按全局及 Origin 限流：每分钟最多 120／60 次请求、12／6 个新意图，Worker 内排队最多 16；持久窗口在 Worker 冷启动后保留。应用不新增按 tab 可无限绕过的限流器。

相同 intentId＋相同 subject 复用原 reviewId、operationId 和实际审阅页；同 ID 不同内容拒绝。新应用／版本／revision 使用独立审阅页，不能更新已有审阅 URL 或内存候选。审阅页从持久记录解析固定对象；手工改变 Hash 也不切换本次候选。

开页顺序为持久化 prepared → 查找实际固定审阅 URL → 聚焦／创建 → 记录 opened。浏览器开页与存储不是原子事务。任一步回执丢失均返回未知交接；同请求重试先找实际标签页，不盲目再开。测试需分别保存 prepared、create、opened 窗口的证据等级。

消费标记在原安装预检之后、首安装日志之前，在共享 intent 锁内持久化。已消费意图不能因安装日志裁剪或全局 batch 被后续批次替换而再次安装。TTL 清理保留原未结事务、原未结 batch 和已消费但未结的交接；不删除安装器日志、工具数据或其他批次的恢复记录。

消费成功但回执丢失时，不继续安装。可信页重新读取持久 intent 及本机日志，不依赖内存里的消费值；页面立即提供适合当前状态的恢复入口。若原事务存在，使用原安装恢复服务；若已消费而首事务日志不存在，用户可以明确“核对本机状态并结束此交接”。该动作取得原 tool／batch、catalog、intent 锁，检查没有相关在途操作，只记交接结束原因，保留 consumedAt，不写安装事实，也不宣称原结果成功。再次安装必须重新发起新意图并审阅。

套装页面及恢复 handler 还必须匹配 `handoff.operationId === batch.batchId`。同一 collection/revision 的另一批次不能成为本页结果；原 handler 在锁内重查 batch 身份。成功批次项保留；未知项不自动重放；队列中尚未派发项目通过现有恢复逻辑标为中断。

## 8. 一次审阅、安装、权限与数据

单应用审阅集中展示用途、运行位置、OpenDesk 发布者、扩展内制品来源、固定版本、当前基线、所需能力、新增能力、数据保留和网站授权说明，摘要放技术详情。套装使用同一能力映射、中文逐项状态和固定 revision。

实际提交仍通过 `installReviewedSidebarTool`：原 tool/catalog 锁、规范化包摘要、来源、固定版本、宿主兼容、容量、权限差异及 baseline 再核对。`commitIntent` 只是新增的可选交接消费门，不建立另一安装器。baseline 变化发生在消费前时，页面提供同一固定候选的新审阅，不沿用已失效批准。

应用自定义 `alert()`、`confirm()`、`prompt()` 不参与正常安装使用；沿用当前内联审阅。安装不运行应用，也不授予网站权限；用户在工具入口主动给需要的网站授权，正常使用复用原许可。Chrome 自身必要权限仍由相应真实操作触发，不由测试直接写授权存储冒充批准。

更新保留用户数据并遵循原来源／迁移规则；结果未知先恢复核对，失败不得覆盖已可用状态。卸载沿用原注册表、授权、来源和数据清理及恢复。代码回退不意味着应用数据能够回滚，界面和文档都不承诺未实现的数据恢复。

## 9. 固定版本和历史输入

`official-tools/releases/*.json` 是原发行生产者／已绑定原始证据的发布快照，不是另一份源码登记。`npm run snapshot:market -- <新文件名.json>` 只追加新文件；同版本但不同摘要／字节／元数据、同 revision 不同成员都会拒绝构建，必须发新版本／revision。

本轮保存开始候选及整合后候选，历史 Mac 记录中的五个发行描述保留原来源身份。reading-kit r1 不变；r2 固定为 reading-toc 1.0.3、web-markdown-clipper 1.0.0、quick-notes 1.1.6。整合 `3134e2b1` 的网页笔记 1.1.8 后，新增推荐 r3，只将新组合的笔记固定为 1.1.8；r2 原成员和 1.1.6 发行仍留在历史快照。历史 r1 的 quick-notes 1.1.1 仅有固定套装引用、没有完整发行快照，因此其 URL 显示“发行记录待核对”，不编造 hash，也不替换为当前笔记。

并行 main 将 time-review 1.3.0 的代码继续修改后，本轮保留此前 1.3.0 快照，将整合后的制品发布为 1.3.1；功能修改保留。归档存在只表示可解释旧链接，不保证用户当前扩展包含该包，也不是签名／审核状态。摘要、包来源、发布者和审核状态分别表达。

## 10. 启动、部署与实际验收

从仓库根执行已有命令：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build:dev
npm run build:market-site
python3 -m http.server 43132 --bind 127.0.0.1 --directory dist/app-market-public
```

在 Chrome 加载 `dist/development`，核对实际 ID 与 `dist/development/marketplace/channel.json` 相同，再访问 `http://127.0.0.1:43132/`。构建网站的默认开发 Origin 与服务器完全一致。若目录发生变化或实际 ID 不同，在同一 shell 设置开发 ID 后重建两端。改端口也必须重建两端；不终止占用端口的其他会话。

新增 `npm run dev:market` 会先独占绑定同一 loopback 端口，再构建网站并服务产物；失败不会杀其他进程。它是网站构建＋服务入口，扩展仍按已有构建／加载方式准备。

Python 原命令能服务实际静态页面，但不会应用 `_headers` 文件，也不会为无效路由返回定制 404 内容。新增开发服务会应用安全头和生成的 404。正式托管必须把 `_headers` 转换为实际平台响应头，保留目录 index、404、正确 MIME、HTTPS 和 CSP；不能把文件“已生成”当成响应头“已部署”。

生产构建：

```bash
npm run build
OPENDESK_MARKET_BUILD_MODE=production npm run build:market-site
```

正式配置未完成时产物显示渠道未配置，不能进行正式安装。确认域名／发行 ID／获取地址、HTTPS 和头部后，必须用该真实 Chrome 发行包验证正式网页消息、审阅及安装。部署凭据和公开发布动作没有因本地通过自动获得授权。

自动化复用 `tests/framework/app-market-r3-native.test.mjs` 的原 CFT 原生输入驱动，新增 R5 helper，不使用伪 sender 或直接写安装记录。

```bash
CHROME_BIN=/实际/Chrome可执行文件 \
OPENDESK_NATIVE_MARKET_R5=1 \
OPENDESK_NATIVE_EXTENSION_PATH=dist/development \
OPENDESK_NATIVE_BUILD_MODE=development \
OPENDESK_NATIVE_ARTIFACT_DIR=artifacts/app-market-r5/native \
node --test tests/framework/app-market-r3-native.test.mjs
```

CI 在 Linux 和 macOS 上使用固定 Chrome for Testing，分别保存输入身份、网站 build ID、实际扩展 ID/Origin、真实操作、事务、数据摘要、截图、正常重启和失败原件。CI 状态、原始 receipt 和未测试数组必须一起核对；没有最终原始 PASS 不能凭绿色 job 验收。

原生中断测试复用未修改产物中的四个实际调用位置：prepared持久化后/开页前、创建审阅页后/记录opened前、消费标记确认后/首事务日志前、注册表写入确认后/结果终态前。位置通过 AST、加载脚本 SHA 和 CDP 精确 call 断点绑定；只读观察后停止实际 Worker 或关闭可信审阅页，再由原 HTTP 意图恢复。不把这些调用者中断称为 Chrome API 原生回执丢失。原始错误、未知状态和具体未测范围必须保留。

Worker 的 DevTools target ID 可能跨执行重启保留。观察器先对同一 session 的浏览器 uniqueContextId 作只读正对照，断点命中时再次核对；停止后只接受本次匹配 version/registration/source 的 stopped 事件，加实际 target 消失，或旧 context 真实销毁和同一 target/session 上的新执行证据。后者要求旧 unique ID 精确返回原生 `-32602 / uniqueContextId not found`、新 unique ID 正对照成功、实际脚本 SHA 不变；断开、超时、旧 stopped 事件都不能替代。动态保存实际 Target 快照，避免把延迟消失误判为复用。仅在旧执行已销毁而 target 留存时，可点击原 HTTP 网页的连接按钮发送一次 PROBE 唤醒；这不是安装重放，也不能代替终止证明。PROBE 正常维护限流和过期记录，不能宣称整个存储完全无写入。

浏览器正常关闭时，Chrome 可能拒绝后到的被动清理 API。产品仍执行原清理，只将四个明确被动阶段的精确 `The browser is shutting down.` 拒绝记为“清理被中断”警告；其他消息、启动、授权、活动调用和 Foundation 身份错误仍为错误。原生验收保留每个原始警告，要求实际固定入口、原生 Error、同一 Chrome generation、真实 Browser.close 至观察到 code=0/signal=null 正常退出的时间区间同时匹配。警告不表示清理完成，不改变安装事务或恢复状态；错误和未解释异常门禁继续保留。

可信审阅“打开使用”沿用内部 `tool.html`。导航和 Foundation 宿主边界共用纯 URL 形态：零参数、单 hostInstanceId，或该host加唯一有效toolId/previewId。有定位参数必须是真实顶层TAB sender；不进入缺documentId的SidePanel恢复分支。定位值只选择已有界面，不能代表安装批准、任务执行或权限；原 Authority/任务工作台/工具能力核对均保留。正常工具页需观察原资源诊断中的真实已连接端口，并在完整关闭前后拒绝未解释的产品运行异常。

## 11. 后续远程分发的独立接入边界

现有能力不能回退：Page 的 `dependency-manager.js` 仍支持显式准备／批准的受控 HTTPS `@require` 依赖；执行仅使用锁定本地字节。Page／controller／Task 开发构建已有 `lock-program-remote.mjs`、`remote-esm-modules.mjs`、`remote-esm-network.mjs` 的远程 ESM 审阅、锁、限额和离线编译。这些不是应用市场远程整包安装。

| 类型 | 保留的准入及执行合同 | 未来分发新增部分 |
| --- | --- | --- |
| Sidebar sandbox | 自包含包验证、原审阅、来源／版本／权限、opaque sandbox 和受控 SDK；不允许运行时远程 privileged JS | 固定制品获取与缓存、发布者签名和信任根；按 sandbox 实际执行能力核对 MV3 政策 |
| Page Program | 原候选导入、依赖锁、真实验证、Available／Installed、网站授权和 USER_SCRIPT 合同 | 将验证过的固定远程制品输送到现有候选入口，不通过市场消息直接调用 Broker |
| Task | 原 taskId/version 身份、候选验证、durable effects、准入、安装和 RunHost | 增加固定包输送及发布者证明，保留 Task 本身所有验证和运行控制 |

独立任务必须定义：信任根、发布者 ID、签名算法和被签字段、密钥轮换／撤销、撤回的已安装影响、制品限额、托管允许来源、离线缓存、宿主兼容性、数据迁移与失败恢复。哈希仅证明所比对字节相同，不等同来源签名；签名也不等同代码全面安全审核。R5 外部协议仍保持两个有限操作，不演变为远程运行 RPC。

## 12. 官方机制核对

本轮核对日期为 2026-10-12。以下资料用于验证适用机制，不自动形成设计分或实际验收证据：

- [Chrome 消息机制](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [externally_connectable](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)
- [Match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)
- [Runtime MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender)
- [MV3 要求与远程代码边界](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- [VS Code 扩展市场](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)

## 13. 2026-11-10 VIP 接续修正与实际边界

复用现有 R5 网页、固定发行和原 Host。VIP 使用原 `GET_APP_STATUS` / `OPEN_INSTALLED_APP`，缺工具走原 `OPEN_INSTALL_REVIEW` / `GET_INSTALL_STATUS`；严格 subject/intent 消息字段未增加 URL、激活码、Cookie 或命令。普通应用行为不变。开发专属入口只接受 `http://127.0.0.1:43132/apps/opendesk/ai-vip-share/#vip-ref=…`；新增拒绝任何 query，并在 `APP_OPENED` 后再次核对精确入口及 fragment 摘要，阻止等待期间改链接后继续。只有合法打开回执才导航原批准 7898 激活页；导航成功不代表原 Controller 已预检。

P0 的 ESM 报错来自旧 `runInNewContext` 把模块当普通脚本；修正夹具以注入真实 ESM exports，保留正式客户端 import。另将 WebCrypto 单次 event-loop 等待改为有截止时间的实际请求等待。三文件检查 56/56 PASS，静态网站构建 PASS，实际 ego 中 client/接续模块/channel 均 HTTP 200，缺宿主明确 `E_NO_RECEIVER`、零新事务，并提供真实开发安装说明；未静默安装 Chrome。

早期观察：本地原43132是其他owner旧快照，仍发VIP1.4.2，当时没有替换。独立 43134 预览显示正式 Catalog 的 1.4.32（143989 B，SHA-256 `cbffe4776d5530e64b19eb500e9c58b64e41d14bddefde96c59cba2e2367beda`），但该预览来源不等于安装 Host 批准来源，也不会被 VIP 开发接续规则接受。未放宽来源或 provenance 来得到通过。

原 Controller + SQLite Provider 的端口、条款、并发和恢复证据见 [VIP 唯一账本](../../../projects/ai-vip-share/dev/local-test/EXTENSION-VIP-TEST.zh-CN.md#market-vip-integration-20261110)；执行结果见 [原 Market workstream](../../framework/workstreams/app-market-r5.md#market-vip-integration-20261110)。最新1.4.34开发实机核心链DEMO_PASS：原市场审阅升级、APP_OPENED后7898接续、7903自动无消费预检、一次确认3次额度、双Surface同收据，以及Provider重启/页面刷新/侧栏重开均已核对；完整CHROME_PASS矩阵和production仍未执行。历史 R5 Chrome 结果和旧 1.4.32 登录证据不提升为新候选证据。

历史17:53实机观察已纠正此前缺接收端：默认共享Profile现有Host，旧市场1.4.2对实际安装1.4.18返回 `different-version`，原审阅保持review，未取得APP_OPENED。独立app.html复现 `E_REACT_LIST_OWNERSHIP`；公共ToolShell已修复其错误创建侧栏列表控制器的问题，19项定向检查通过，但原watcher被并行Web Flow来源漂移拦住，运行代码仍旧。原本地调试Host不支持Demo所需网络/代理，不能仅补开发构建或放宽预览权限；候选、原43132服务与合法Demo接入仍待对应owner协调。详见同一VIP账本的新续接小节。

**18:48收尾：** 用户明确授权本轮解决候选与服务归属后，43132已由原服务入口提供1.4.34；原writer退出后恢复同一dist/development，原生开发服务连接已核对。只修复外部sender省略fragment的定位比较、app.html侧栏列表所有权及原合法app Browser SDK sender，未改安装协议/授权范围。唯一包157547 B，SHA-256 `6cf868116f59c957efe9858c0372f57fa553f6b998b6f04a843180dd83fd031f`。开发会员只读POST沿用原端点和Origin保护。当前核销1、总数2、旧收据不变，具体原件与未测范围以同一VIP账本为准。
