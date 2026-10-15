# Bookmark Manager R2.4 runtime closure

Owner: Codex session 6a663b0db1a3, 2026-10-15. State: SOURCE_COMPLETE / NATIVE_BLOCKED.
Branch: main. Baseline: 8dc346e0432e11115862b39614b2d46a04f5cebb.
Environment: independent Linux clone; user Mac and Chrome Profile unavailable.

Write scope: src/platform/chrome/bookmarks-full.js;
examples/sidebar-tools/bookmark-manager/{src/main.js,tool.config.json,README.zh-CN.md};
tests/environment/{browser-sdk-r112-full-bookmarks,bookmark-manager-r2,bookmark-manager-r24-lifecycle}.test.mjs;
.github/workflows/bookmark-manager-r2.yml; this workstream and its evidence directory.
No Registry, Schema, facade, Host, permission or installation protocol change.

Confirmed gaps: the ninth snapshot in 120 seconds fails E_LIMIT even for routine
refresh/CRUD; subscription starts after reading the tree, leaving an unobserved
change window; refreshing while a form is open replaces its reviewed precondition.
Also review in-flight generation/ticket expiry fences immediately before writes.

Call path remains sandbox consumer -> OpenDeskSDK generated facade -> installed
tool bridge -> trusted Side Panel user-intent admission -> existing Browser Host
and approved Dispatcher -> Full Driver -> Chrome. Only UI state and the existing
Driver change; no private IPC or additional trusted business implementation.

Resources: this clone's node_modules, dist/production, dist/development and
artifacts/sidebar-tools/bookmark-manager. No watcher, port or Chrome Profile used.
Reuse prior f508dc60 evidence for unchanged contracts; affected runtime tests and
requested build/full regression will be rerun with new evidence. Native remains
NOT_TESTED; existing optional Catalog/legacy deletion predates this session and
does not constitute Native release approval. Issue #75 stays open.

## 实际交付

已通过 GitHub 插件的 expected-HEAD、非强制更新提交至 main：
`a2be6815ad1f58907b10da1dc31df738b1bcacce`。
源码树 `48f8cfa4d9c65f91df1bb08dbfcea179751798a5`。
本地原提交 `5c6535be` 与远端源码树完全一致，已同步到远端正式 SHA；没有创建分支或 PR。
后续本报告及日志提交不改变任何产品、测试或构建输入。
提交证据前重新读取远端，保留并行的 `ecd1d643`（AI VIP Share 的 DESIGN、preview HTML、
preview 测试和工作记录）。这些文件不进入本轮书签源码及发行构建输入，不重跑无关验证，
也不将书签证据提升为 AI VIP Share 的验收。

实际修复：

1. 快照池仍最多 8 份；连续刷新只回收同一安装身份的最旧快照，旧游标明确过期，不再让正常 CRUD 在第九次刷新时停用两分钟。
2. 先开启 SDK 观察会话再读取完整分页快照，覆盖读取期间变更；读取失败立即关闭观察会话。
3. 自动刷新保留编辑/移动草稿及用户最初审阅的节点条件，防止外部修改被静默当成已批准版本。
4. 写入入口捕获撤权代际，在最终原生调用前再核对；撤权后重新授权也不能复用正在执行的旧请求。
5. 删除票据在所有异步预检完成后再次检查期限；票据摘要计算后的容量检查保证并发预检最多 16 张。
6. 监听到预检期间的 Chrome 书签变化时，写入失败关闭；预期节点按字段值比较，不再依赖 JSON 字段插入顺序。
7. 消费端版本提升到 0.3.1，CI 包路径按实际版本匹配，新增生命周期测试纳入专项工作流。

## 验证与包身份

原始日志、两个完整构建回执及机器摘要：
[evidence/bookmark-manager-r24-runtime-closure/summary.json](evidence/bookmark-manager-r24-runtime-closure/summary.json)。
所有测试为真实执行；Chrome fixture/DOM fixture 明确属于组件，不属于 Native。

| 验证 | 结果 |
| --- | --- |
| 用户指定七项 + 当前文档 + 新 UI 生命周期套件 | 81/81 PASS；同树本地与同 SHA CI 均验证 |
| 安装器、Host、官方 Catalog、固定入口预算 | 121/121 PASS（与其他套件有重叠，不相加当作独立功能总数） |
| npm run check | PASS，711 个文件 |
| 唯一矩阵 / 生成 Binding Catalog 校验 | PASS；67 批准 = 65 public + 2 Host-only，未改变批准范围 |
| npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager | PASS，0.3.1，43,745 bytes，installed:false |
| npm run build / build:dev / verify | PASS；两个构建 sourceDriftDuringBuild 均为空、输入摘要一致 |
| npm test，双构建之后 | FAIL：2598 tests，2575 PASS、14 FAIL、9 SKIP |
| Bookmark 专项 CI | [38699430342](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430342) PASS |
| Browser SDK R5 CI | [38699430386](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430386) 合同及双构建 PASS |
| Browser SDK 主线 CI | [38699430625](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430625) 合同及构建 PASS；原生重启 SKIPPED |
| Sidebar 安装与打包 CI | [38699430348](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430348) PASS |
| 固定入口预算与库边界 CI | [38699431358](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699431358) PASS |
| 官方市场原生 CI | [38699430316](https://github.com/shopable-ai/opendesk-browser/actions/runs/38699430316) FAIL，三项真实 Chrome 流程均阻塞 |

14 个全仓失败逐类保留：dev-installation-diagnostics 三项（包诊断断言、Homebrew Node 选择、Unix Socket EPERM），
native-agent-instance 一项及 native-agent-native-host 九项（Unix Socket EPERM），papa-parse-r1 一项
（从 catalog.js 导入不存在的 PAGE_OPTIONAL_LIBRARY_IDS，模块加载失败）。这些文件本轮未修改；
失败集合与 f508dc60 的历史记录一致，未放宽、删除或跳过测试。
首次全仓测试在没有 dist 时还有包依赖失败，补齐双构建后已消失；初始失败日志也保存。

市场 CI 的 Linux production、Linux HTTP 和 macOS HTTP 均在点击
`#sidebar-tool-discover-toggle` 时超时，尚未到 Bookmark Full 验收。
对照前一源码 f508dc60 的 [38697059850](https://github.com/shopable-ai/opendesk-browser/actions/runs/38697059850)
及 job 116296015899 原始日志，确认同样的选择器超时先于本轮存在。
没有以增加等待、合成点击或绕过 UI 来伪造通过，也未覆盖并行 UI 工作。

包身份：

- 工具 SHA256：`4e1a6c371e0abfc4e219605515460c4c188cbb38c8909f225f70e94c6f100c4a`。
- Production：`f9b6fdaf9b670f7f1b0b9bab2663ec4792d5b4709f132e2bd181561ba444e2c6`。
- Development：`4e82bf4b0a97413e56459f076a9ad500f3e95a17a0589e0d17395f2503e3dd63`。
- 初次生产构建检测到本轮最终票据容量修复造成的输入变化，已明确拒绝；仅后续冻结构建计 PASS。
- 此执行环境曾留下本会话已结束构建的 PID 锁。仅在取得其 OS 输出守卫、验证精确 token/root 和已完成会话后清理自有锁；没有停止或接管其他 watcher。

## 用户要求的 17 项结论

| 项目 | 可证明事实与剩余边界 |
| --- | --- |
| 1. Full 12 接口 | getTree/get/search/create/update/move/remove/prepareRemoveTree/removeTree/observe.start/read/stop 均经同一 Facade/Dispatcher/Driver 组件调用，SOURCE_WIRED + NODE_PASS；真实 Chrome 全部 NOT_TESTED |
| 2. Owned / Full | 独立 capability、包身份、安装代际与撤权拒绝回归 PASS；真实权限 UI NOT_TESTED |
| 3. 真正安装运行 | 独立包和安装器/Host 回归通过；此书签包真实 Profile 安装 NOT_TESTED |
| 4. 当前页收藏 | 既有 opaque TabRef/DocumentRef 链与同 URL 文档替换等拒绝用例 PASS；本轮未另造 Tab SDK；真实使用 NOT_TESTED |
| 5. 500/550/1000+ | 100/500/550/1001 fixture 全分页通过，10,500-byte 分页预算未扩大；真实 Profile NOT_TESTED |
| 6. 文件夹完整 CRUD | 组件正向/拒绝用例通过；Native NOT_TESTED |
| 7. 非空目录删除 | 根/managed/预期节点/子树摘要/身份/单次票据/期限/撤权代际/已观察到的变更均有拒绝证据；不存在原子 CAS，未观察到的最终原生读写竞态仍存在，真实窗口时长 NOT_TESTED |
| 8. 事件 / Worker | 七种事件、overflow/gap/过期、重建会话失效、先观察后快照及关闭清理有 Node 证据；跨窗口/实际 Worker 重启 NOT_TESTED |
| 9. 旧目录 | 接手基线已删除 src/bookmark-manager/；本轮没有恢复 |
| 10. 旧 HTML/CSS/import | src/scripts/workflows 静态检索无旧有效入口；旧入口移除回归通过 |
| 11. 单份业务实现 | 业务位于 examples/sidebar-tools/bookmark-manager/；宿主继续仅承载通用 SDK/Host/Driver |
| 12. Catalog | 基线已 optional 登记，0.3.1 随原构建器生成；原生安装未通过，不能称正式发布验收完成 |
| 13. CI | 上表分别给出 PASS、FAIL、SKIPPED；全仓没有宣称全绿 |
| 14. 真实 Chrome | Bookmark Full NOT_TESTED；共享市场 Native CI FAIL；没有用户 Mac、Profile、扩展 ID 或 installEpoch 的验收证据 |
| 15. Issue #75 | 保持 OPEN，不能关闭 |
| 16. 本轮生产代码量 | JS +59/-27；工具配置 +1/-1；合计 +60/-28，净增 32。源码提交全部文件含测试/说明 +286/-36；此前旧业务删除不算作本轮贡献 |
| 17. Git SHA | 产品及测试源码 a2be6815ad1f58907b10da1dc31df738b1bcacce；本报告后续提交仅增加证据 |

现有读取合同仍限制标题 256 字符、URL 4096 字符、树 20,000 节点、深度 100、快照 8 MB。
新增用例保留长中文/特殊字符及已有 file: URL 原值；超界明确失败，不假装支持任意长度或无限树。
任意超长历史节点兼容属于未扩充的合同边界。本轮没有修改普通 SDK IPC 限额。

**已有门禁偏差**：最新基线在 Native 尚未通过时已登记 Catalog 并删除旧 UI。
本轮记录这一事实，保留唯一业务实现，不恢复两套业务，也不把它认定为用户要求的先原生验收后发布顺序已满足。

## 逐维独立评分

本轮没有独立专家审查及完整 Native 产品证据，不能制造 95+ 分数。

| 维度 | 证据 / 评分状态 |
| --- | --- |
| SDK 架构一致性 | Node + 生成矩阵 + CI PASS；NOT_SCORED |
| Chrome API 正确性 | Driver fixture PASS，Native NOT_TESTED；NOT_SCORED |
| Owned / Full 权限隔离 | Node 拒绝路径 PASS，Native NOT_TESTED；NOT_SCORED |
| Host 安全 | 代际/一次性票据/并发与过期回归 PASS，真实手势 NOT_TESTED；NOT_SCORED |
| 完整 CRUD | Node PASS，Native NOT_TESTED；NOT_SCORED |
| 分页与事件可靠性 | Node PASS，原生跨窗口/Worker NOT_TESTED；NOT_SCORED |
| 独立工具消费兼容 | 包、81 项定向及 CI PASS，安装使用 NOT_TESTED；NOT_SCORED |
| 旧业务清理及解耦 | 静态与回归 PASS，历史门禁顺序偏差保留；NOT_SCORED |
| 测试与回归 | 专项 CI PASS，全仓14失败、市场Native失败；BLOCKED |
| 真实 Chrome 产品完成度 | NOT_TESTED / BLOCKED；无95+结论 |

## Mac Codex 验收命令及操作清单

先读 AGENTS.md，核对 main、未提交文件、现有 npm run dev watcher 和已加载扩展 ID/目录。
仅无重叠修改时快进 main；不得覆盖 watcher 的 dist/development。
下列 build 命令仅在对应输出没有 writer、按仓库协议安排的验收窗口执行：

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git status --short
git fetch origin main
git log -1 --format=%H origin/main
# 确认没有重叠修改后，仅快进：git merge --ff-only origin/main
node --test tests/environment/bookmark-manager-r2.test.mjs tests/environment/bookmark-manager-r24-lifecycle.test.mjs tests/environment/browser-sdk-r112-full-bookmarks.test.mjs tests/environment/browser-sdk-r124-current-page.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager
shasum -a 256 artifacts/sidebar-tools/bookmark-manager/0.3.1/bookmark-manager.opendesk-tool.json
npm run check
# 仅在验收输出资源已释放的窗口运行：
npm run build
npm run build:dev
npm run verify
```

1. 专属 CFT/Profile 加载 production 候选；记录源码 SHA、构建 hash、Chrome 版本、扩展 ID/目录/Profile、工具 packageHash/installEpoch。
2. 从正式扩展中心安装 0.3.1：首次拒绝不能显示私人树，再明确允许；逐一执行全部 12 个接口，并保留真实原生回执。
3. 专用测试目录放入 100/500/550/1001 条、多级/空目录/256 字符/中文/特殊字符/已有非HTTP(S)节点；比对全部原生 ID、父子及顺序。连续刷新/CRUD 超过20次，确认不再耗尽快照。
4. 分页中新增/修改/删除、跨窗口变更和导入，必须最终重新同步；验证所有七类事件、溢出/Gap/会话过期、Worker重启及跨包/epoch引用失效。
5. 编辑时由另一窗口改名，保留草稿但提交应冲突；当前页收藏覆盖导航、同URL重载、切换、关闭和撤权。
6. 非空目录预检后变更子树、managed后代、票据过期/重复/跨安装及预检中撤权均失败关闭；记录最后原生重检到执行间隔及未观察竞态边界。不得宣称原子CAS，不自动重放未知写入。
7. 停用、升级、卸载、重装与Chrome撤权；原生书签不被卸载删除，其他工具不能继承Full，沙箱不能访问chrome.bookmarks。
8. 市场Native选择器失败先由其UI/验收负责人核对真实布局；不绕过可信输入。取得全部同候选证据后，再决定发布、Issue关闭与逐维独立评分。

文件与构建资源：RELEASED。没有 Mac watcher、浏览器 Profile 或 Native 配对被改动。
