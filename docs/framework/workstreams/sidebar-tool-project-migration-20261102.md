# Sidebar Tool 正式项目迁移与后续目录审计（2026-11-02）

状态：SOURCE_MIGRATED_ON_REVIEW_BRANCH / PRODUCT_CI_PARTIAL_PASS / INSTALLED_MAC_NOT_TESTED。此文件是单次迁移审计与协作范围记录，不是新目录规范或新的 CI / Installer / 任务账本。长期规范继续以 docs/architecture/extension-project-layout.zh-CN.md 和 docs/framework/parallel-development.md 为准。

## 1. 原始需求、负责人和边界

目标：将 AI 消息发送队列和浏览器指纹两个**已有业务应用**从 examples/sidebar-tools/ 实际迁至 projects/，修复所有影响运行/安装的路径和 CI 入口，保留同一份源码与可安装包字节、ID、版本、权限、存储及行为；完成后只盘点其他目录，不搬第三个项目。

- 本次写入负责人：本迁移任务；基线 GitHub main = c3216b2e55ac851e886f6be05f0f36e78c918736；独立评审分支 chore/migrate-queue-fingerprint-to-projects-20261102。未覆盖共享本地工作树，不向 main 直接推送。
- 移动范围：examples/sidebar-tools/ai-send-queue/ → projects/ai-send-queue/；examples/sidebar-tools/browser-fingerprint/ → projects/browser-fingerprint/。
- 依赖写入范围：两个项目的 package.json、Vite/CI/测试与预览路径、原 README；四份专用 GitHub Actions；官方 Tool 和 Page 来源 Catalog、两处可信路径白名单、根路径契约测试、通用 app:update 项目发现、Web Flow 和 Automation Lab 中对迁移路径的文字引用。
- 禁止范围：Web Flow 业务实现、Cookie Editor/AI VIP/ScrapyJS 业务、共享 Host/Authority/RunHost 权限逻辑、根 manifest、已发行 JSON 数据、现有 Native 配对、旧冻结收据与其他历史候选；不清理其他例子。
- 共享资源：日常 dist/development、已有 npm run dev watcher、真实 Mac Chrome/CFT/profile、授权数据库和最终发布区均不由本审计持有。原本并行 owner 保持不变；本轮不争用它们。

本轮属于**路径迁移**，不是“增加两个 MV3 独立 Chrome 插件”。两者均由 OpenDesk Browser 宿主加载 Side Panel Tool；AI Send Queue 还拥有 Page USER_SCRIPT 项目与发行包。Chrome Manifest、固定来源 pin、工具能力和 Page 规则保持原值。

## 2. 实施范围与必须不变的合同

| 对象 | 新唯一位置 | 配置和消费者修复 | 不变项 |
| --- | --- | --- | --- |
| AI Send Queue | projects/ai-send-queue/ | 根 Vite 相对层级、预览与专用浏览器驱动、项目脚本引用、官方 Tool Catalog 和 Page Catalog 两套白名单、GitHub Actions、根级集成测试、Web Flow 文字链接 | 工具 ID/version、Page programId/revision、FIFO/重试与未知副作用语义、正式 .opendesk-tool.json/.opendesk-page.json 字节、用户授权及版本 pin |
| Browser Fingerprint | projects/browser-fingerprint/ | 根 Vite/打包器调用、React 预览的共享 CSS 导入、Native/Chromium 驱动相对路径、GitHub Actions、旧项目研究入口 | 工具 ID/version、已有五项 Tool 能力、保存键/会话/恢复流程、正式 .opendesk-tool.json 字节、root debugger/网站许可与可信 Host |
| 通用 CLI | scripts/app-update.mjs | 按 projects/<id> 和 examples/sidebar-tools/<id> 两个受控位置搜索，验证真实目录及**唯一** owner；仍复用原打包、源码检查与人工安装审阅 | 不允许多 owner、符号链接、凭名称跨目录、静默安装或额外权限 |
| App CI | scripts/app-ci.mjs（不修改） | 现有 APP_SOURCE_PARENTS 同时发现 projects 和 examples，并拒绝重复 ID | 不引入新的注册表或另一套测试运行器 |

完整原始目录由 Git tree 移动；没有复制旧项目再保留双运行目录。历史证据保持原文及原 SHA，用作历史来源，不等同于新路径候选验收。若旧 PATH 出现在旧 commit、发行回执或冻结证据中，允许按原始发生时的路径保留；**活跃构建/运行/CI/README 命令不允许继续引用旧目录**。

## 3. 其他项目后续迁移清单（只读分类）

字段解释：A=明确正式项目、推荐以后迁；B=需要先定产品 owner/类型；C=技术演示/验证、保留；D=公共模块或平台资源，不按 Sidebar 项目搬；E=已在 projects/，无须重复迁。P0 表示影响当前构建/安装的必要修复，P1 优先单独迁，P2 后续评估，P3 暂不迁。批次 0 为本轮；批次 1–3 均未执行。

| 当前目录 | 项目名称 | 项目作用（通俗描述） | 当前定位 | 建议目标目录 | 是否建议迁移 | 优先级 | 复杂度 | 主要风险 | 推荐批次 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| projects/ai-send-queue/ | AI Send Queue | ChatGPT 网页 FIFO 消息队列与侧栏说明 | E 正式 Page + Tool | 保持原地 | 否（已迁） | P0 | 已实施 | 固定 Tool/Page 双 Catalog、hash/发布门禁 | 0 |
| projects/browser-fingerprint/ | Browser Fingerprint | 保存并应用授权网站的环境预设、独立读回与恢复 | E 正式 Tool | 保持原地 | 否（已迁） | P0 | 已实施 | debugger 权限、Native 生命周期与原生恢复 | 0 |
| examples/sidebar-tools/ai-vip-share/ | AI VIP Share | 网站登录与 Cookie 会话的受控管理 | A 正式 Tool，有 React、trusted、测试、发布包 | projects/ai-vip-share/ | 是（需交接） | P1 | 高 | 可信来源、Cookie/授权、CI、并行版本开发 | 1 |
| examples/sidebar-tools/cookie-editor/ | Cookie Editor | 读取、编辑、导入和恢复 Cookie | A 正式 Tool，有 trusted、多个 UI/测试入口 | projects/cookie-editor/ | 是（需交接） | P1 | 高 | 正在修复 Bottom Sheet / UI，包较大、权限和主机接线 | 1，待稳定 |
| examples/sidebar-tools/scrapyjs/ | ScrapyJS | 网页采集、CSV 与本地运行/Controller 组合 | A 正式复合项目 | projects/scrapyjs/ | 是（需交接） | P2 | 高 | 并行采集 UI/Bridge 修改、vendor、Controller、路径数量多 | 2 |
| examples/sidebar-tools/app-primes-423c62d375df/ | 素数筛选冻结 B2 | 素数任务的升级/后台生命周期验收 | C 冻结测试应用 | 保留现目录 | 否 | P3 | 低 | 固定 ID、原 B2 验证收据，不能视为垃圾 | — |
| examples/sidebar-tools/app-primes-d50c3c971ed4/ | 素数筛选冻结 B1 | 同一算法另一个冻结版本的状态测试 | C 冻结测试应用 | 保留现目录 | 否 | P3 | 低 | 版本、时间点与其他样本不能混写 | — |
| examples/sidebar-tools/app-words-648ac9d668db/ | 词频计算冻结 B1 | 词频后台任务、计划验证样本 | C 冻结测试应用 | 保留现目录 | 否 | P3 | 低 | 运行结果 expected.json 和 B1 回执 | — |
| examples/sidebar-tools/app-words-b72b4bea7cec/ | 词频计算冻结 B2 | 第二轮词频任务升级/生命周期样本 | C 冻结测试应用 | 保留现目录 | 否 | P3 | 低 | 原安装身份及证据绑定 | — |
| examples/sidebar-tools/browser-sdk-acceptance/ | Browser SDK Acceptance | 测试书签、存储、下载和计划接口 | C SDK 专项验收工具 | 保留现目录 | 否 | P3 | 中 | 公共 API 验收应保持隔离 | — |
| examples/sidebar-tools/browser-sdk-r13/ | Browser SDK R13 | 右键菜单、当前能力查询示例 | C SDK 示例 | 保留现目录 | 否 | P3 | 低 | 历史 API/授权文档 | — |
| examples/sidebar-tools/browser-sdk-r2/ | Browser SDK R2 | 网络、Tab、截图等原生能力示例 | C SDK 示例 | 保留现目录 | 否 | P3 | 低 | 权限演示不应当产品发布 | — |
| examples/sidebar-tools/dev-hot-preview-p0/ | Hot Preview P0 | 首次开发、预览更新的最小测试 | C 开发验证 | 保留现目录 | 否 | P3 | 低 | watcher/预览身份，非正式安装包 | — |
| examples/sidebar-tools/import-max-probe/ | D3 Import Max Probe | 验证固定第三方 ESM 导入、编译和 SHA | C 依赖验证 | 保留现目录 | 否 | P3 | 低 | 固定 vendor hash 与验证证据 | — |
| examples/sidebar-tools/papaparse-csv-export/ | Papa Parse CSV Export | 以固定 Papa Parse 生成/下载 CSV 的示例工具 | B 可复用样例，是否产品化待确认 | 保留现目录，真有产品 owner 再选 projects/papaparse-csv-export/ | 待确认 | P2 | 中 | downloads 授权、独立用户需求尚未确认 | 3 |
| examples/sidebar-tools/react-starter/ | React Starter | React 笔记和图表学习模板 | C 技术教学 | 保留现目录 | 否 | P3 | 低 | 使用者复制时应重新设身份 | — |
| examples/sidebar-tools/runtime-globals-demo/ | Runtime Globals Demo | 演示 OpenDeskTool iframe API 和运行世界 | C 最小示例 | 保留现目录 | 否 | P3 | 低 | 框架全局变量契约 | — |
| examples/sidebar-tools/shared-ui-demo/ | Shared UI Demo | 演示共享 UI、React/预览的接线 | C 组件验收示例 | 保留现目录 | 否 | P3 | 中 | 共享组件的回归证据 | — |
| examples/sidebar-tools/vue-starter/ | Vue Starter | Vue 笔记项目的教学起点 | C 技术教学 | 保留现目录 | 否 | P3 | 低 | 固定依赖/构建模板 | — |
| examples/programs/chatgpt-jump-top/ | AI Chat Scroll Navigation | 官方聊天页面滚动、定位和导航 | B 成熟 Page Program，当前 Page 类型默认在 examples/programs | 保留，未来视 Page owner 选择 projects/ai-scroll-navigation/ | 待确认 | P2 | 高 | Page 正式目录、官方 Page Catalog、来源 pin 和已有原生验收 | 3 |
| examples/programs/chatgpt-calculation-relay/ | ChatGPT Calculation Relay | 可复用的跨对话计算 Controller Task | B 独立 Task，原合同不要求归 Sidebar projects | 保留原目录 | 待确认 | P3 | 高 | 已冻结 Task ID/版本/发布包，不可当 Tool 搬 | 3 |
| examples/programs/chatgpt-voice-cleanup/ | Voice Cleanup | 语音草稿文本整理辅助流程 | B 未完成自动接力的 Page Demo | 保留原目录 | 待确认 | P3 | 中 | 当前模型回传身份尚未可信，避免虚假产品化 | 3 |
| examples/programs/listing-sku-inspector/ | Listing SKU Inspector | 只检测测试页面的商品字段异常 | C Page 演示项目 | 保留原目录 | 否 | P3 | 低 | 测试页面授权与受限目标 | — |
| examples/programs/其余 Page/Controller 示例目录 | 多文件、单文件、组件/ESM 等示例 | 展示 Browser Page/Task 运行方式 | C 技术样例、用户示例 | 保留各自原目录 | 否 | P3 | 低～中 | 不应凭目录名强制改种类和身份 | — |
| examples/cloud-control/（含 local-business、mac24dev-demo） | Cloud Control Demo | 验证云控任务、受限本地网站和原有 Provider | C 有界演示 | 保留现目录 | 否 | P3 | 高 | Provider/端口/原生证据；业务代码不是独立 Tool | — |
| examples/import-ready/ | Page Import Drafts | React/Vue 可导入 Page 草稿快照 | C 测试输入 | 保留现目录 | 否 | P3 | 低 | 固定源码哈希和可重放草稿 | — |
| examples/libs/trusted-imports/ | Trusted Imports | 解释可信入口如何使用预装库 | C 教学 | 保留现目录 | 否 | P3 | 低 | 不误入沙箱世界 | — |
| examples/local-workspace/ | Workspace Demo | 内存 Markdown/HTML/代码编辑与预览 | C 原型 | 保留现目录 | 否 | P3 | 低 | 非真实文件授权连接 | — |
| examples/network-javascript/ | Network JavaScript | Page/Controller 标准 import 测试 | C 接口样例 | 保留现目录 | 否 | P3 | 低 | 固定远端依赖、安全来源 | — |
| examples/tasks/（含 browser-fingerprint/ 诊断页） | Task Fixtures | 统一 demo-form 网页、搜索 Task/指纹诊断页面 | C 跨项目测试页与任务样例 | 保留现目录 | 否 | P3 | 高 | 43111 统一入口、根级测试及历史证据 | — |
| examples/ui/ | UI Preview References | HTML 离线交互和设计参考 | C 视觉原型 | 保留现目录 | 否 | P3 | 低 | 不应误装成正式实现 | — |
| examples/shared/markdown/ | Markdown Shared Converters | 剪藏等多个消费者复用的转换与选区代码 | D 已有共享代码 | 维持现有共享归属，后续单独审计 consumer | 待确认（不搬 projects） | P3 | 中 | 公共 import 路径、跨业务所有权 | 3 |
| packages/opendesk-dev/ | OpenDesk Dev CLI | 开发者工具包/CLI | D 独立 package | 保留 packages/ | 否 | P3 | 低 | npm/Native 版本与命令合同 | — |
| modules/development-build.js | Development Build | 通用开发构建入口 | D 平台模块 | 保留 modules/ | 否 | P3 | 低 | 编译框架职责 | — |
| native-agent/ | Native Agent | 本地授权和文件/浏览器配套功能 | D 平台服务 | 保留 native-agent/ | 否 | P3 | 高 | Native 安全、配对、进程生命周期 | — |
| official-pages/、official-tools/ | Official Source Catalog | 官方发行源清单与安装资源的可信映射 | D 信任根/发行资源 | 保留原目录 | 否 | P3 | 高 | 固定来源白名单及包字节，不能合并入普通项目源 | — |
| prototypes/ | Historical Previews | 保存旧界面方案和可比较 HTML 原型 | C 历史/原型 | 保留 prototypes/ | 否 | P3 | 低 | 保持设计溯源，不是运行入口 | — |
| projects/既有 20 个项目（含 webflow、task-shop、bookmark-manager 等） | 已迁移正式项目 | 现行产品/项目及部分研究档案 | E 已有独立 owner；browser-automation-lab 是合并的历史资料 | 保留 projects/ 各自目录 | 否 | P3 | 不适用 | 尤其 Web Flow 正在并行开发，不重复迁移/合并 | — |

此清单来自实际根目录和子目录内容、各代表 README/config、现有源码/CI 的定位。对 Page 样例不逐一宣称已经产品成熟；对四个冻结测试应用，名称随机后缀体现原安装/候选身份，不得未经引用与证据审计删除。项目优先级不是对已有业务价值的否定。

## 4. 分批实施与最小目录治理

**批次 0（本轮）**：只完成两个指定项目迁移，CI/路径修复，保留旧冻结字节。Web Flow 仅改显式引用新位置，不接管队列；Automation Lab 仍为历史研究，不建立第二项目。

**批次 1**：AI VIP Share、Cookie Editor 分别由原 owner 安排独立窗口；先读主分支最新状态和本地 git status，确认当前 React/Cookie/UI 工作已冻结、已有候选和原生验收的适用 SHA。一次只迁一个，不同步重构业务。

**批次 2**：ScrapyJS 仅在采集 UI/共享 AI Chat/Controller 当前开发任务完成或交接后迁移，先列出多层应用/依赖/代码消费者；不得抢 Web Flow 对象或移动数据模型。

**批次 3**：评估是否让 Papa Parse 导出成为正式产品，以及 Page Program/Controller 的长期 owner 类型；不自动迁移测试示例。对 shared/markdown 若多个正式消费者确有统一模块需求，单独制定相对 import/测试合同，而不是按名称移动。

长期规范复用 docs/architecture/extension-project-layout.zh-CN.md：新正式 Sidebar 工具默认 projects/<id>/，教学 demos 默认 examples/，Page/Task 按类型合同保留；每项目 README 应包含唯一 owner、构建命令、Tool/Page 安装身份、版本/权限、真实测试级别；AGENTS.md 仅在项目独有禁改项或协作边界时可选；继续使用现有 scripts/build-sidebar-tool.mjs、scripts/build-program-project.mjs、scripts/app-ci.mjs，避免新的统一脚手架/运行器。不同技术栈保留各自 Vite/Vue/HTML 构建方式。正式包仍需候选校验/同源晋升，迁移不自动发布。并行只能按具体文件与固定资源互斥，协调 Git index/HEAD、Chrome Profile、Watcher、dist 发布槽，不因 docs 描述而假定锁已释放。

## 5. 验证合同、可复查命令与未测边界

迁移源码只读检查：Git tree 精确复用原两个项目的树作为移动输入，新目录由同一来源树加少量路径修改产生；旧源码位置删除，未产生双运行目录；正式 JSON、工具能力和根 manifest 未修改。

必须从仓库根目录在 **本地最新 main 合并候选或同一 PR 分支** 执行（有现有 watcher/Chrome 资源 owner 时先协调；命令不可覆盖它的 dist）：

    npm ci --ignore-scripts --no-audit --no-fund
    npm --prefix projects/ai-send-queue test
    npm --prefix projects/ai-send-queue run build
    node scripts/validate-program-project.mjs projects/ai-send-queue
    node scripts/build-sidebar-tool.mjs projects/ai-send-queue --check-project
    npm --prefix projects/browser-fingerprint test
    npm --prefix projects/browser-fingerprint run build
    npm --prefix projects/browser-fingerprint run preview:build
    npm --prefix projects/browser-fingerprint run preview:check
    node scripts/build-sidebar-tool.mjs projects/browser-fingerprint --check-project
    node --test tests/environment/official-tools-catalog-r45.test.mjs tests/environment/official-page-catalog-r124.test.mjs tests/environment/send-queue-product-installation.test.mjs tests/environment/app-update-workflow.test.mjs tests/environment/app-ci.test.mjs

额外扫描：git grep -n -F 'examples/sidebar-tools/ai-send-queue' 与 git grep -n -F 'examples/sidebar-tools/browser-fingerprint'，按运行时代码/活跃文档与历史证据分类。查询 git diff --find-renames --stat 与 git diff --check 核对未丢文件。对 App CI 的唯一 owner 通过原 scripts/app-ci.mjs 发现命令验证，不能用静态目录存在替代真实构建通过。

Chrome 原生：用户用真实已授权 OpenDesk Browser 版本导入当前仍相同字节的 Tool JSON，核对版本/权限/身份；Queue 验证 Page FIFO 顺序、停止、重试/UNKNOWN 不重放；Fingerprint 验证授权应用、独立网页读回、停止与基线恢复。**与本迁移候选绑定的真实 Mac Chrome 原生证据尚未产生，必须标为 NOT_TESTED；历史验收不得直接继承。**

GitHub PR 上自动执行的测试只根据具体 Workflow 运行详情标为 PASS/FAIL/PENDING，不用树对象和旧版收据冒充。此次云端 GitHub 迁移不持有用户 Mac 的 git status、Chrome 进程、Native 配对和真实权限，均 NOT_TESTED；在本地做最终集成前需检查未提交的并行修改。


## 6. 本轮实际 GitHub Actions 回执（2026-11-02）

本节仅报告**真实运行**，不把计划命令或历史截图算成 PASS。当前审阅 PR 为 https://github.com/shopable-ai/opendesk-browser/pull/77 ，最后工作分支以 PR HEAD 为准；迁移合并到 main、用户 Mac git status 和日常 Chrome 安装尚未验证。

| 执行入口 | 真实回执和结果 | 限制 |
| --- | --- | --- |
| Browser Fingerprint R2.2 | https://github.com/shopable-ai/opendesk-browser/actions/runs/41346055401 ：SUCCESS。原项目 Node suite 72/72 PASS，Vite build PASS，原 Chrome 权限/SDK guard PASS，Linux Chrome for Testing 真实 source-driver 的应用/读回/恢复 PASS | 此 Chrome 是**源码级驱动**，不是通过日常 OpenDesk 正式安装后测试；Mac Native 与原生 installed-r24 工作流未运行 |
| AI Send Queue R5.11 | https://github.com/shopable-ai/opendesk-browser/actions/runs/41346055393 ：FAIL。实际项目源码/Page 静态准备 PASS；Vite build PASS，候选 Tool JSON 已创建并通过格式校验；Node 196 个用例中 193 PASS、3 FAIL | 未晋升到受信正式包，未进行真实官网 ChatGPT FIFO；失败不能当作业务通过 |
| Queue admission（失败 1） | projects/ai-send-queue/tests/admission.test.mjs：当前候选 JSON 22,882 bytes 与既有正式 JSON 13,967 bytes 不相等，正式包来源审阅测试 FAIL | 不为目录迁移修改安装版本、旧发布包字节、Host pin 或发行许可。另由 Queue owner 调查并按原晋升流程处理 |
| Queue crown preview（失败 2/3） | projects/ai-send-queue/tests/crown-selected-defaults.test.mjs 与 tests/view.test.mjs：仍用旧 HTML 内嵌代码正则匹配；当前 R5.11 预览代码位于独立 boot.js 等文件，相关断言 FAIL | 不为使迁移 PR 全绿而降低断言；由 Queue owner 审阅是否调整测试源码引用，先证明与基线的关系 |
| Page userscript dependencies and package | https://github.com/shopable-ai/opendesk-browser/actions/runs/41346055388 ：FAIL，8 项共享 Side Panel/开发 UI 测试断言不通过 | **迁移发现的 E_OFFICIAL_PAGE_BUILD 旧目录信任根拒绝已由 scripts/build-official-pages.mjs 精确路径修复**；此轮日志不再报告该拒绝。其他 8 项不属于这两目录路径迁移，需原 owner 区分是否已有基线问题 |
| 其他 PR 通用工作流 | PR 产生多条全仓共享检查，部分 FAIL，例如 Agent Skills 任务受 esbuild 安装缺失影响 | 不是本迁移专属验收；按 job 的具体失败测试归因，不逐项接管其他所有者的功能 |

源码位置的安全门禁只允许 projects/ai-send-queue/ 单一既有 Page Program 被审阅，未向全部 projects/ 开放 Page 发布；App Tool 和 Page 的两个独立来源白名单均已更新，发布策略仍 blocked/原值。浏览器原生 installed UI / macOS Profile 实测、Web Flow 并行业务真实回归、Chrome 安装状态、形式化同源晋升：均 NOT_TESTED 或 BLOCKED，不能随 PR 创建自动推断为完成。

本记录中的数字与 URL 是对应提交的 CI 结果，而不是最终合并后的 main 结果。后续若通过新 commit 修复，必须在同一个工作流追加新回执，不能悄悄覆盖失败记录。

## 7. 追加迁移扫描、指向修复和非回归边界

GitHub PR 的真实 `git grep -n -F` 对所有受版本控制文件运行（不是单靠代码搜索索引）。第一轮 45 处旧路径，修复 Host 集成测试、Web Flow 当前执行计划/产品合同及 Automation Lab 的活跃源码文字后，回执 https://github.com/shopable-ai/opendesk-browser/actions/runs/41348265764 确认剩余 **30** 处。已定位实际失败的 Page Catalog 输入排序问题，修复后回执明确相关定向检查 **33/33 PASS**；测试没有放宽目录信任范围。Browser Fingerprint 最新同一阶段专属 CI https://github.com/shopable-ai/opendesk-browser/actions/runs/41348265696 SUCCESS；72 项 Node 与构建/权限/源码级 Chrome 操作均在该运行通过。

剩余旧引用主要分三类：

1. **必须保留的原始证据**：`projects/browser-fingerprint/evidence/` 内 2026-10-30 之前的 source path、固定 SHA/Build receipt、原始执行命令。原证据被创建时旧目录真实存在。改成当前目录会篡改历史上下文，因此保留原文字，并在当前 README 中指向新目录。
2. **有意测试非法来源**：`tests/environment/official-tools-catalog-r45.test.mjs` 中 `examples/sidebar-tools/ai-send-queue` 被当作应拒绝的旧/伪造 Catalog 位置；保持原负例，不把它改成已批准位置。
3. **历史或待 owner 审阅的说明**：`docs/api/browser-sdk-interface-matrix.json` 中的历史 evidence 相对位置；`projects/webflow/docs/webflow-v0.3-ui-ux-review.zh-CN.md` 的旧 Queue owner 描述。后者在并行 main 中已被另一个任务修改，未为本迁移覆盖其文件；请 Web Flow owner 以当前 HEAD 审阅对应一处。普通设计引用 `DESIGN.md` 与现行 Recipe 已随迁移修正。

专属 CI 新增只读门禁：全仓留下历史引用允许，但 **src/、scripts/、official-pages/、official-tools/、.github/workflows/** 出现旧两项目位置即失败；扫描结果继续作为原工作流的审计 artifact。它不删除文件、不更改任何 Host 授权、不声明 Mac Chrome PASS。

**未关闭：** Queue 旧正式包与现开发候选字节不相同（安全门禁按原合同 FAIL），以及两个旧内联 HTML 断言与当前预览拆分实现不符；这是本轮原记录已知的独立接力，不能用修改 frozen JSON、pin、安装版本、放宽断言或造新预览来凑 PASS。若需要调整，交由正在维护 Queue 的 owner 和本地 Codex 与其当前工作同步，先核对原基线是否已失败。Browser Fingerprint 的原生 viewport 恢复在 https://github.com/shopable-ai/opendesk-browser/actions/runs/41347737281 有一次 FAIL，另有多次同源码 SUCCESS，不能删除该失败或把一次源码级 PASS 推断为 Mac 正式安装 PASS。
