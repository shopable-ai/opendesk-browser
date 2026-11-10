# Single App · Multiple Surfaces 本地验收与交付记录

> 2026-11-09 后续状态：本记录为冻结候选的核心验收证据，不是整体完成声明。已补 [可查看网页与启动器](progress/README.zh-CN.md)，本地入口 http://127.0.0.1:43264/ 。c1a95457b 的远端 Actions 11个中1成功、10失败；App CI 已定位 AI Proxy 缺显式 app.ci.json，其他 Provider/工具回归另有失败，详见 [实际日志分类](progress/CI.zh-CN.md)。下文历史“当前核心无阻断”不消除这些 CI 缺口；production/公网等延期范围保持。

日期：2026-11-09。仓库 `opendesk-browser`，现有 `main`。本轮测试和修复既有实现；没有新建 Host、Installer、代理 Service、数据存储、应用 ID、分支、worktree 或并列 GOAL。

## 1. 原始目标与真实可用操作

已在真实已安装扩展中完成：AI Proxy 侧栏 → 应用自己的 PC 指定栏目 → 修改／保存／存储读回 → 关闭 PC → 侧栏重开读取 → 明确选择代理（Chrome 保持 system）→ 主动申请并完成原 Host 审阅 → Chrome 确认精确包身份的 PAC → 本任务受控 HTTP 请求／回显 → 暂停并回读 system。0.3.8 → 0.3.9 原位更新保留配置，未先卸载。

这些是五个独立事实：标签页创建；配置保存读回；已保存选择；Chrome 应用回执；真实请求经过代理。页面只显示相应已确认的状态。受控流量仅覆盖本任务 loopback HTTP 代理，不证明公网可达、出口 IP、设备 VPN 或任意站点成功。

原本不支持的能力仍明确拒绝／标记：联网订阅、代理认证、任意 PAC／多节点应用、官方登录／计费／订购、真实 HTTP 诊断。PAC／轮换的原内部编辑路由保留，不将保存或模拟探测显示为已联网。

## 2. 去重与实际修复

| 状态 | 操作／实现 | 依据与本轮处理 |
| --- | --- | --- |
| DONE | 固定自身工具页、surface／initialPage、可选 openOwnPage | 已有 9393b53、9a6b9d3、14e6456 均在当前 main；直接复用 `src/tool-document-url.js`、`src/ui/sidebar-tools/navigation.js`、Bridge、Host、tool-shell 和唯一 React root |
| DONE | 原 Header Actions Demo、AIProxy 七区／四模式与 Service | 复用原目录和 `App → QuickPanel/Settings → environment/service`，没有复制预览 Mock 或设置组件 |
| PARTIAL → DONE | 开页期间撤权／安装替换竞态 | c5973ec：在原工具生命周期锁内复核安装／撤权代际，旧请求不得越权创建页面 |
| PARTIAL → DONE | 已发存储写入超时／关闭被误报为普通失败 | c5973ec：Bridge 明确 E_OUTCOME_UNKNOWN，不自动重放；Demo busy 字段与弹窗阻止反馈修复 |
| PARTIAL → DONE | 页头异步事件及迟到反馈污染导航 | c5973ec、d194a1c：真实手势边界保留，可信与沙箱原入口分别处理；三语 unknown 提示、导航代际及旧错误清理 |
| PARTIAL → DONE | PC 编辑器读取刷新后丢失旧 ETag，可能覆盖另一窗口 | 真实操作定位；053d01d：按编辑 scope 保留基线和 ifMatch，保存后回读；干净旧表单和脏草稿均拒绝旧写入 |
| PARTIAL → DONE | 新代理 endpoint／profile 分两次保存的部分提交风险 | 053d01d：同一 CAS 原子创建；STOP 保留独立可用的释放路径 |
| PARTIAL → DONE | PC 侧导航被 grid 纵向拉伸 | 053d01d：align-content:start；实际六项42px、官方项66.05px |
| BLOCKED → DONE | 隔离 Browser 固定来源检查 | 30b02f6、c98be735：核对已提交源码后更新 Reading TOC／Webflow／AIProxy 精确来源 pin；原漂移拒绝逻辑保留 |
| NOT_TESTED → DONE | 真正 SIDE_PANEL、安装升级、配置和代理核心链 | 本轮实际 Chromium 及原安装器／Host 回执；Fixture 与 Installed 证据分别记录 |
| NOT_TESTED | production、公网出口、OS 语言菜单、完整故障／焦点／尺寸矩阵 | 未冒充通过；不是当前已发现的产品缺陷 |

并行文件仅保留：`src/sidebar-tools/bridge.js`、`sandbox.html`、`src/ui/sidebar-tools.js`、`tool-shell.css`、`react/tabs/tool-host.tsx` 的其他 owner 布局改动；公共 API／导航文档、Scroll Navigation、Send Queue、Webflow 及布局测试改动。只提交本任务自有文件／已审阅 hunk；完整工作区观察保留在本机 `preserved-parallel-status.txt`。

## 3. 框架与 Demo

公共入口：`OpenDeskTool.openOwnPage({view:"settings",section:"preferences"})`，只能打开当前已安装 Tool 自己的固定扩展页。view／section 是有界路由提示，不授予权限；opened:true 只证明标签页创建。真实点击／Enter、当前实例／安装代际、撤权和只读边界保持；合成事件、任意 URL／Tool ID、普通 postMessage 不构成授权。旧 Host 安全降级，unknown 不换 ID 重试。

实现：`src/tool-document-url.js`、`src/sidebar-tools/bridge.js`、`src/ui/sidebar-tools.js`、`src/ui/tool-shell.js`、`src/ui/react/main.tsx`。公共合同：`docs/api/sidebar-tools.zh-CN.md`。

Demo 保持 `examples/sidebar-tools/header-actions-demo/`、ID `header-actions-demo`、版本1.1.0。唯一正式包 `header-actions-demo.opendesk-tool.json`：16612字节，SHA-256 `cd27d6d80264a43d1569349cabaec1f06f5ea433875d3658438fd9b61ebd707c`，与已真实安装测试的候选逐字节相同，原 packer 晋升及 check-project MATCH。

源码夹具运行：在仓库根执行 `node examples/sidebar-tools/header-actions-demo/preview/serve.mjs`，打开它输出的本地 URL。操作：打开 PC 首选项 → 修改名称／紧凑模式 → 保存并读回 → 回侧栏重新读取；同时打开第二 PC，用旧 ETag 保存应报冲突并保留草稿。源码夹具为 SOURCE_FIXTURE_PASS。

实际安装证据为另一路径：原安装器导入同一包，在真正 SIDE_PANEL 打开 Demo；PC 保存、侧栏读取、旧 ETag 冲突、刷新重开、关于栏目、原页头资料库和返回通过，记 INSTALLED_CHROME_PASS。未共享未保存草稿。

## 4. AI Proxy 业务、视觉与状态

正式业务仍由 `src/main.jsx`、`App.jsx`、`QuickPanel.tsx`、`Settings.tsx`、`environment.ts`、`service.ts` 执行。R18／R16 参考唯一 `preview/preview.html`；未再创建历史命名副本，未把离线 Mock 复制为真实业务。侧栏紧凑摘要和 PC 独立管理布局均实际展示；只修影响操作的状态语义及 PC 导航拉伸，不声称像素完全一致或全尺寸矩阵完成。

| PC 栏目 | 实际结果与边界 |
| --- | --- |
| profiles | 原表单编辑／保存、原子创建及回读；四种模式和待应用／实际应用分离；旧 ETag 拒绝覆盖 |
| rules | 实际显示规则栏目和默认路由；域名／子域／优先级／权限边界以项目 Node 回归验证，未称全部规则表单在 Chromium 重跑 |
| subscriptions | 原订阅记录／本地客户端入口保留；本地客户端真实申请运行；联网订阅未接入 |
| backup | 原本地 JSON 验证／导入／导出界面保留；安全与服务回归通过，未称所有文件导入组合原生验证 |
| diagnostic | 实际正确栏目；界面明确模拟且不请求目标网站；受控代理回显为独立验收探针，不冒充本栏目已实现真实探测 |
| general | 实际栏目及语言设置；已安装可信组件中 en／zh-TW／zh-CN controlled value、七区文本和内容一致（DOM 表单驱动） |
| official | 显示官方服务暂未开放，未伪造登录、订购、线路或计费成功 |

原侧栏应用设置／管理全部／网站规则／诊断／订阅入口均验证为实际正确内容，非只检查 URL。可信 Header 原生 Enter 及原添加／取消确认仍可用；沙箱异步页头保持原内部导航，由内容区真实点击调用开页。配置、代理选择和 Host 实际运行状态分别读回。

## 5. Codex 测试、失败分类与最小复验

| 实际命令／范围 | 结果 | 证据 |
| --- | --- | --- |
| `npm --prefix projects/ai-proxy test` | 257 PASS，0 FAIL；0.3.9重新执行 | release-project.tap |
| `node --test examples/sidebar-tools/header-actions-demo/tests/*.test.mjs tests/environment/sidebar-tool-export-bridge-host.test.mjs tests/environment/sidebar-own-page-contract.test.mjs tests/environment/tool-ui-tab.test.mjs` | 127 PASS，0 FAIL；053d01d，相关业务源码之后未变 | final-framework-demo.tap |
| `node --test --test-name-pattern="own PC page|corrupt installed event during installation read" tests/environment/sidebar-tools-host.test.mjs` | 4 PASS，0 FAIL | final-own-page.tap |
| `node --test --test-name-pattern="trusted AI Proxy" tests/environment/bundle-provenance.test.mjs` | 2 PASS，0 FAIL；0.3.9来源锁 | release-source-lock.tap |
| `node --test tests/environment/sidebar-tools.test.mjs` | 8 PASS，0 FAIL；包规范／晋升／安全 | release-package.tap |
| `npm --prefix projects/ai-proxy run build` | PASS，49模块 | release-project-build.log |
| `npm run check`（独立冻结快照） | PASS，1319源码／测试／构建文件及严格CSP／固定入口／MIT | release-source-check.log |
| `npm run build:dev`（同一独立快照，单 writer） | PASS，静态 development | release-browser-build.log |
| 原 packer `--out` → `--promote-from` → `--check-project` | AIProxy及Demo均 MATCH | release-promote.log、release-check-project.log、demo-check-project.log |

398个互不重复的本任务相关测试用例通过（257+127+4+2+8），不将重复重跑相加。不是根完整测试或全CI通过声明。

失败保留：本轮较早五文件广批次336 PASS／16 FAIL，其中10项冻结夹具缺少原 Reading TOC 包路径，另6项旧 Bookmark／来源断言在原HEAD基线亦复现；当前完整 provenance 文件与包测试合跑32 PASS／6 FAIL，仍为同6项无关历史断言。未删除或放宽测试制造PASS，不将它们记为本任务回归。旧错误构建和失败日志保留；来源锁问题已在核对已提交源码后最小修复，新 Browser 构建有效。

原生故障单独绑定：053d01d + e38f8f… Browser + 61301b…沙箱。真实暂停原 Host writer，Bridge 超时保留草稿／unknown；恢复仅观察1次写入，迟到回执不清 unknown，再次主动保存遭冲突且不增写。真实 WebLock 将安装替换排在旧 storage.set 前，释放后旧实例退役、测试键未落盘、原配置保留。它们不证明全局 exactly-once 或所有竞争排序。2199ca…原正式包 + 同 Browser 的可信 React 另有核心链与三语 DOM证据。

0.3.9包相对61301b…唯一差异字段为version；业务源码未变，admission仅版本标记及对应来源锁变化。新版本已重新执行安装升级／保存读回／七栏目／代理申请和真实loopback／释放；未冒称所有旧异常在新包上重新运行。

## 6. 五层门禁与实际候选身份

| 层 | 状态 | 当前证据及范围 |
| --- | --- | --- |
| SOURCE | PASS | 053d01d业务 + 本次0.3.9六文件overlay；来源锁与实际文件哈希核对，1319源码检查 |
| NODE | PASS | 本任务相关398用例；新metadata257／8／2再验；上述无关广批次失败继续记录 |
| BUILD | PASS | Vite + Browser静态development；非serve、非production |
| CHROME | PASS | 当前0.3.9真实SIDE_PANEL及PC、原安装器升级／数据、原Host回执、精确包身份PAC、owned loopback请求、释放；其他未验范围不得外推 |
| PACKAGE | PASS | 唯一0.3.9正式JSON已由原打包器晋升、同源MATCH、实际安装包语义逐项匹配；Demo同包字节亦晋升MATCH |

业务源码基线：`053d01d843966eb966e9820b5dcadc1aca044ed7`。冻结方式为普通 git archive 快照叠加六项已核对发行文件，不是 worktree；明细在本机 `release-overlay.json`，后续提交仅加入相同发行字节与不参与构建的文档。

最新Browser：mode development，attempt `8378488f-ae7c-4e5a-b4cf-1fea1ff658d4`，packageHash `14632d9ee26fa26f20fc98fd06c2d7d71e36b3a9ebb0cb9356b36319ef896ea9`。Chrome156.0.8078.4实际加载 `/private/tmp/opendesk-surfaces-20261109-native/dist/development`，扩展ID `chacagjgggacgpeigkalhkegiiedehjp`、版本0.1.0、ENABLED／UNPACKED，manifest/runtime errors为空。真实contextType为SIDE_PANEL，非普通tab替代。

AIProxy：ID ai-proxy、版本0.3.9、946159字节、SHA-256 `30615091d14dcb61b2a9b058f4dc4798963cba94cc011ee683240362cdb367b8`。实际PAC owner包含同SHA和新installEpoch；nonce `8b13116a-ed6f-4538-9c89-b712c8869c4c` 同时出现于真实请求与响应。最终回读system、controllable_by_this_extension。

验收Profile曾显示其他Page官方预装候选变化提示 `E_PAGE_RELEASE_CHANGED`；原受控AIProxy安装／使用不受阻，本轮没有修复或重试这些无关预装。关闭前无AIProxy工具锁，其他预装工具曾持有的浏览器WebLock随本任务浏览器关闭释放，不手工清锁。

隔离Profile `/private/tmp/opendesk-surfaces-native-profile-b4bvkN` 保留供复查；本任务浏览器及loopback server已关闭，无自有锁遗留。日常 `dist/development`、现有 watcher、个人Profile、系统代理及Native配对未改。普通网页Fixture用ego TaskSpace49并已释放；专项扩展／SIDE_PANEL／代理测试保留CFT合同，ego网页通过未冒充专项通过。

## 7. 五角色审查与分数

均为同模型、独立上下文的角色化自评，不是五名外部专家。各自重新读取源码／原始证据，并对0.3.9版本差异及新build绑定复核；未继承历史分数。

| 角色 | A Demo | B SDK安全兼容 | C AIProxy | D测试原生 | 个人均值 | 扣分依据 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 产品与交互 | 97 | 98 | 97 | 98 | 97.50 | 完整键盘／焦点和OS语言菜单未验 |
| Framework／SDK架构 | 97 | 98 | 97 | 96 | 97.00 | 其他故障交错未覆盖；指出的晋升索引已同步，保守保留评分 |
| 权限／沙箱／生命周期 | 98 | 98 | 98 | 97 | 97.75 | Enable／STOP未知结果等原生时序与完整类型检查未验 |
| React／HTML／Vue | 98 | 98 | 98 | 96 | 97.50 | 保存中继续输入、PAC异步确认等细边界原生覆盖有限 |
| Codex测试／反方攻击 | 97 | 98 | 99 | 96 | 97.50 | 完整故障组合及OS popup未验 |
| 阶段平均 | 97.4 | 98.0 | 97.8 | 96.6 | 97.45 | 无有效P0/P1 |

综合为五个个人均值的算术平均：`(97.50+97.00+97.75+97.50+97.50)/5=97.45`。本轮核心范围评分达到95门槛；评分不将任何未验能力变为PASS，也不意味着production正式发布。

## 8. GitHub与可复验交付

本轮修复提交：c5973ec（生命周期／unknown／Demo）、d194a1c（导航迟到反馈）、30b02f6和c98be735（已审阅固定来源pin）、053d01d（CAS编辑基线／原子创建／PC布局）。当前发行提交同时包含0.3.9配置、package版本、可信版本标记、来源锁、版本回归、唯一正式JSON及本记录；Demo正式JSON和说明同次保存。具体最新提交以 `git log -1` 及最终对话回执为准，避免文档自引用commit循环。

远端核对已执行 git fetch origin main；打包前 main 相对origin/main只多053d01d本任务提交。旧Actions 42515866056中的路由通过、Sidebar未最终通过及AI VIP失败不是新候选CI证明；本轮未触发全CI或无关产品修复。提交／推送实际结果以最终回执为准。

唯一安装文件：本目录 `ai-proxy.opendesk-tool.json`。通过扩展中心原「更多操作 → 导入本地工具包」审阅同ID／新版本／权限，原位更新，不先卸载。固定可信React／Host更新需要本轮匹配Browser构建；单独导入JSON不会替换Browser内已编译组件。日常浏览器未替换或升级，实际安装仅在上述专属Profile。

复验：打开AIProxy → 管理设置／管理全部 → PC代理配置；编辑名称保存并取得回执 → 关闭PC → 侧栏返回目录重开读取；选择代理后检查system；只在隔离环境对受控本地客户端主动启用并审阅，核对PAC身份和新请求，暂停后确认system。停用／撤权和旧实例退役已有原生记录，不自行清理unknown锁或重放请求。

## 9. 剩余最小任务与证据位置

当前核心范围无已知阻断缺陷。若要production发布，另需冻结production候选并在专属Profile核验；公网出口、原生OS语言菜单、完整类型诊断、全部键盘焦点／尺寸和故障时序仍NOT_TESTED。原本未实现的联网订阅／认证／任意PAC／官方服务按产品后续需求处理，不为本轮制造成功。上述项目未自动开展或建立新GOAL。

本机原始日志、截图、完整五角色输出、源／构建绑定和每步原生读回：`docs/framework/evidence/single-app-surfaces-20261109/`（忽略目录，不强制提交生成物）。入口 `native-result.json`、`result.json`、`reviews.json`、`report.zh-CN.md`、`release-overlay.json`；历史失败／旧评分另保留，不覆盖当前事实。提交的本记录给出可分享的关键结果与哈希。

## 10. 2026-11-10 · R16 PC 视觉续接（未完成安装晋升，历史验收不得复用）

**原始目标**：让正式的已安装 AI Proxy `app.html?toolId=ai-proxy&view=settings&section=profiles` 尽量接近 `preview/preview.html` 的 R16 PC 设置工作台，同时保持 R18 侧栏及实际 Host／Service／SDK／配置 CAS／浏览器权限。优先用户可以打开、识别代理、切换栏目、增删改、刷新后读回；预览的模拟联网、诊断或代理切换不可冒充真实成功。

本轮从 `main` 的 `d655c54caa44b15cf8ad6fe2775ab85871d8a6cf` 开始直接检查并修改原正式工程，绝不新建框架、App 或预览。**正式路由仍为 `profiles`**（预览使用 `proxies`），未破坏 Host 初始页面参数或深链接。

| 文件 | 实际已提交的改变 |
| --- | --- |
| `src/Settings.tsx` | PC 初始加载、七区导航标题、代理空状态；代理行区分配置已选择与 Chrome 回执已应用；Side Panel 保留原图标与编辑能力 |
| `src/styles/management.css` | 仅 `.proxy-management` 下复用现有 token 的 R16 PC 色板，以及顶栏／状态栏／导航／标题／模式按钮／列表密度／记录操作和840px／560px响应式 |
| `src/ui/useProxy.ts` | 前台聚焦和可见性恢复只读 GET_STATE；有未保存草稿或正在写入时不自动读取，且卸载清理监听，绝不自动重放 APPLY／STOP |
| `tests/settings-management-runtime.test.mjs` | SSR 验证真实七区导航、已选／已应用状态、空列表、初始加载，不通过静态样式字符串冒充截图 |
| `tests/use-proxy-errors.test.mjs` | 挂载、前台恢复、草稿保护、不执行写请求、卸载清理回归 |
| `tests/quick-panel-runtime.test.mjs` | 修正历史陈旧断言：明确「Direct 应用」按钮真实标签 `apApplyDirect`，而非旧 `applySelection`；实际原浏览器路由仍保留 |

已提交主分支（按时间顺序）：`ac77b0c`、`e2c2380`、`a0c5e00`、`ade9125`、`560c10b`、`d141b8d`、`4325341`、`9a27319`、`1459ed6`、`567c3e5`。后续若其他 Agent 更新 main，先重新读取当前 HEAD 与变更文件。

**实际 CI**（截至 1459ed6，567c3e5 的 PC token 微调需要另行回归）：`https://github.com/shopable-ai/opendesk-browser/actions/runs/42827857011`，被测源码提交 `1459ed677af7a5b070abd34d7ee5490cef4a14d0`。原 App CI 已执行并成功完成 Vite 编译和未晋升 candidate 打包（版本 0.3.12，971470 bytes，SHA-256 `68ca9613756f1e920305f3aa7e27e3dbfcc3268b6ce00fd56340549b75deefa6`）。合并运行 Node 测试 **364 PASS／1 FAIL**；唯一失败是既存公共 Reading TOC `E_OFFICIAL_FIXTURE_PIN` 与 AI Proxy 本次变更无直接关系。CI 因此未执行其后续 Chromium UI／真实安装步骤，不能标为 Chrome PASS。公共 ci-contract 也因公共门禁报 FAIL，未经本次修复。

**未完成与下一步**：

1. **源码已提交但正式安装包尚未晋升**：原唯一 `ai-proxy.opendesk-tool.json` 仍是旧版本 0.3.12 正式字节，不能宣称已安装的 app.html 已更新。不得手动粘贴 `js`／`css` 覆盖 JSON；按 `AGENTS.md` 和唯一原 packer 的 `--promote-from`／`--check-project` 完成来源逐字节核对后再晋升及原位更新安装。
2. **视觉／真实交互未验证**：用真正已安装 App 的 PC 1440×900 和 Side Panel 400×800 与预览应用区域同视口截图比较，覆盖标题、七区导航、按钮、代理表格、编辑／删除确认、空／加载／错误、滚动；真实 Chrome 代理状态不等于仅选择配置。未有正式截图和原生回执前标记 `NOT_TESTED`。
3. **针对性未解决的公共阻断**：Reading TOC 包来源校验应由对应 owner 处理；不可降低安全校验制造 CI 通过。可以运行无关模块排除后的 AI Proxy 定向测试，但必须如实标记公共 CI 仍红。订阅联网／凭证／官方服务如缺少权限或后台，不做模拟成功。

**审计说明**：第 5–7 节的 0.3.9 安装／截图／97.45 历史自评，只是 2026-11-09 的原候选证据，不覆盖本节 0.3.12 和 `1459ed6` 新源码；本节尚无真实 95+ 视觉评分证据，不允许拿历史分数充当本轮验收。
