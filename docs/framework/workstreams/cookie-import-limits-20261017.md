# Cookie Editor 限制清理 · 2026-10-17

- Owner：本续接 Codex；仅 main，保留其他 Agent 修改；不建分支/worktree/PR。Git 写入仅显式本任务路径，已获提交及正常推送授权。
- 起点本地 5868e24b，远端核对 26254353；远端新增范围未涉及下列 Cookie 文件。索引起点为空。旧记录三份及 testing-guide 已读；原 134 项和样本原生 PASS 按输入身份复用，不重跑真实样本。
- 残留定位：当前源码、正式包及 dist/development 均为 2.0.20 / a5f9372d855becd9207774473dfcfefb40dee8071e9f029d3e6e75ea75819874，无真实导入 10 条限制。旧 preview HTML/React 仍有该文案，仅历史原型，不是发行输入。已安装版本状态尚无当前浏览器证据。
- 实际缺口：工具合并读取 100 条、离线 200 条、预览 500 条与原文 150000 bytes 整批拒绝；installed getAll 在 50 条或 11500 bytes 拒绝。后者源自公开 Schema 与 Host，不是 Chrome 限制，工具不能枚举剩余记录，公共 SDK 缺口已证实。
- 写入范围：工具 src/main.js、src/index.html、tool.config.json、README.zh-CN.md、唯一正式包；cookie-editor-ui.test.mjs；SDK browser-contract.js / browser-schemas.js；browser-cookie-host.js / context-menus.js；browser-sdk-r9-installed-cookies.test.mjs；SDK 现有生成文档、矩阵、freeze/目录计数测试（仅新增公开分页接口所需）；本记录。
- 调用电路：工具 opaque iframe → 原 SDK/Bridge → 原 installed Authority → 原 Host Chrome cookies.getAll → 按预算分页回包。分页每次重新核权，游标绑定同一快照；不改变权限、身份或写入未知结果策略。不新增 Host/安装器。
- 实施：保留原单次 getAll 合同，新增可自动消费的 getAllPage；取消工具条数拒绝，以独立 8 MiB 原文/离线规范数据内存预算替代旧 150 KB/500/200 组合。8 MiB 是暂定内部资源保护，不冒充 Chrome 上限；验证大于旧边界的代表性输入、边界与超限，保持错误后输入。导出 150000 bytes 是现有公开 clipboard/download 文本预算，本轮保留并明确来源。50 条/约 11 KB 是单页/单批传输预算，用户无需拆文件。
- 通过条件：>50 原生记录及大值跨页可完整取回；游标漂移拒绝而不拼接；>500 / >150 KB 输入及 >200 离线记录成功；超资源预算保留输入；原分批写/格式/错误/停止定向回归通过；同源候选通过后原打包器晋升。
- 资源：旧 PID23773 已退出，未见 dev/WXT writer 或 43119/43120 listener。预期 CFT155 不在运行；现有 CFT156 属其他任务，不触碰。development 路径固定 dist/development；本轮不做 production、全仓、缩放、安全/生命周期扩展测试。
- 状态：DEVELOPMENT_FIX_VERIFIED；开发修复与最小定向验证完成，保留下面列出的原生证据边界；Git 收尾结果见本记录所在提交及本机 `artifacts/cookie-import-real-20261017/limits-closeout.json`。

## 已完成验证与候选

- 原打包器生成候选 → 自动门禁 → `--promote-from` → `--check-project` 全部成功。唯一正式包 **2.0.21 / 133060 bytes / SHA-256 `306de34970ee51b6368dd481b8885a39632076172b561ac0d69c1d3ffd43fcc1`**。未改权限、ID、第三方依赖、历史预览或其他工具。
- `limits-focused.tap` 首轮 132/138，失败为旧版本/目录计数、元数据旧上限断言及新夹具缺授权；保留原失败。修复后 `limits-focused-fixed.tap` 138/138。扩展到实际受影响 SDK 合同后 `limits-sdk-and-tool.tap` 217/218，唯一失败为旧 12 接口计数，修复后 **`limits-verified.tap` 248/248**。
- 补充 `limits-boundaries.tap` **3/3**：8 MiB UTF-8 正好边界可解析；超过旧 150 KB 的文件完整载入；超预算文件不读取且保留原文；长列表滚动的真实输入坐标约束。该日志与前述主回归有重叠，不相加伪造分母。最新完整驱动 `limits-driver-final.tap` **31/31**。源码语法、定向 diff、生成绑定/开发文档/矩阵检查 PASS（77 approved / 75 public / 13 Cookie 方法）。
- SDK 分页定向测试：131 条不漏不重；4000 字符值按实际字节缩页；默认脱敏；变更快照/查询、撤权及非法游标拒绝。工具定向测试：601 条 / >150 KB 输入、602 条离线工作区、131 条自动分页元数据；保留原分批写入和未知结果停止测试。
- 暂定 8 MiB 仅保护本地解析原文及离线规范数据；不等同浏览器数量限制、站点配额或导出预算。公开 clipboard/文本下载 150000 bytes、写入单次 12000 bytes、分页单次 11500 bytes、单页/单批 50 条继续遵循现有 SDK；工具自动消费分页/拆批。clearSite 的破坏性精确预览上限、观察会话的时间/事件预算未扩大，本轮不做相应原生扩展验收。

## 持续开发及真实 Chrome

- 确认旧 watcher 已退出且输出守卫空闲后，通过原 `npm run dev` 启动唯一新 watcher，PID **34253**，输出 **dist/development**，43119 服务和 43120 守卫，初次 revision `d5288adea014`，日志 `artifacts/cookie-import-real-20261017/limits-development-watcher.log`。保留 watcher；未启动 production build。
- 新增单项 `import-json-paged`，沿用既有 driver、同一个原生安装/一次网站授权/授权复用、真实 Side Panel 输入、现有 SDK 与 read-only Chrome 验证。只生成虚构 61 条，不读取真实样本。写入范围追加 `tests/framework/cookie-editor-r33-native.mjs`、`tests/environment/cookie-editor-native-selection.test.mjs` 以及所需旧 Cookie roster 计数测试。
- 首次开发 CFT155：`limits-development/native-core-2026-10-17T07-06-01-553Z-74e906e6/native-report.json`。正式安装、一次网站授权和复用、**61 条导入全部 PASS**；候选/driver 未漂移。其后旧逐条清理定位器因元素 y≈1724 超出实际宿主可见区域超时，故 aggregate=false，保留失败，不冒充整轮 PASS。原 launcher 已退出 CFT 并移除唯一临时 profile，`cleanupStatus=PASS`、无残留进程/目录；没有真实样本影响。
- 仅修观察器滚轮落点：对 iframe 自身视口外的元素，使用 iframe 与 Host 的可见交集；仍为 `Input.dispatchMouseEvent`，不使用 DOM 赋值、scrollIntoView、synthetic events。新增模拟宿主较短/iframe 1600 高的定向回归。新增原生元数据总数断言及 development client 状态观察，以区分导入回读与列表分页证据。
- 补跑 `limits-development-scroll-fixed` 在启动前被 `E_NATIVE_RESOURCE_BUSY` 阻止：另一个任务的 prompt-shortcuts CFT PID41014 占用受控原生资源，未停止/接管其浏览器。此次各原生 case 保持 NOT_TESTED。修后驱动当前尚无新的原生 PASS；首轮同候选 61 条导入 PASS 保留。production、真实样本重跑、F3/ZIP、日常已有用户安装版本均未执行。
- 旧 2.0.20 的真实样本证据仅按原候选及未改变的格式/原生观察合同引用，不登记成 2.0.21 的真实样本 PASS。当前交付不把 `aggregate=false`、资源占用或 Node/JSON 证据提升为正式原生验收。
