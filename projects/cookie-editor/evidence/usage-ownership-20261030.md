# Cookie Editor / AI 账号额度归属整改 · 2026-10-30

本轮目标与量表来自当前用户请求。只在 main，保留并行修改，不创建分支、PR 或 worktree。

## 实施方案与迁移前覆盖去向

- 唯一业务 owner 保持 Cookie Editor；将 `services/ai-account-usage/` 唯一实现整体迁到 `../ai-account-usage/`，不保留运行时转发或副本。Node 服务仍独立执行，不进入工具 JSON、沙箱或 Browser SW。
- 根 `tests/ai-account-usage-*.test.mjs` 移到 owner 的 `tests/ai-account-usage/`，使原 app-ci 可递归发现；探测/OAuth/账号服务/历史/会话/传输/决策覆盖逐文件保留。原型测试补入显式 Node 命令；两条 Chromium 驱动移到同一目录，保持显式启动。
- 更新真实消费者：子模块 package（保留父项目package原字节）、CSS Tokens 相对路径、测试源码与子进程 URL、Chromium 构建定位、现有 GitHub workflow 的选择/构建/发布/漂移保护、AI VIP Share 导航和 Cookie Editor 主 README。历史证据不改写路径或哈希。
- 运行数据仍在 `~/.opendesk/ai-account-usage/`；现有 OAuth 来源与 alias/身份绑定不移动、不复制、不读取认证内容。保存交接的 main.jsx、decision 测试、同源生成预览改动。
- 统计修复先由真实 domain 链复现，再按窗口裁剪；固定 7 周期、4 可靠/3 高剩余 ≥80% 不变。迁移前后运行同一组相关 Node 测试，再验证正式/模拟构建及 CI 发现。

## 正式账号入口核查

当前用户操作应为「Cookie Editor → 账号 → 已授权账号 → 额度管理页」。正式 `CookieAccounts.jsx` 没有该入口；HTML 原型的链接不能证明正式功能。

现有 `cookieAccount.*` 固定协议只支持快照管理，没有额度来源、映射或 Node 管理会话转交。独立服务配置中的 `codex_local_01` 只表示另行授权的 Codex 来源；Cookie alias、网站、显示名称和快照匹配均不能证明同一 OAuth 身份。

`browser.tabs.create` 只提供受控导航，不提供账号证明或服务会话发现。不能把一次性配对凭据传进沙箱、复制 Cookie/Token 到 URL，或自行把 Cookie 账号当成 Codex 授权。此链在可信映射和会话发现接通前保持未实现；本轮不制造可点击但假成功的入口。后续用原账号 RPC 的真实拒绝行为保留最小缺口证据。

## 验证与评审

迁移、构建、运行与真实 Chrome 证据分别记录。不会以旧单账号上游成功或 Mock 代替当前 Cookie Editor 原入口。

九维各 0–100，目标每维 ≥95，综合仅算术平均；两位独立评审各自总评也须 ≥95 且无阻断。缺授权、缺真实映射及缺原生证据均据实保留，不更改量表。


## 本轮已落实结果

唯一源码在 `ai-account-usage/`，十二个额度 Node 测试文件及两条 Chromium 驱动在 `tests/ai-account-usage/`，原账号拒绝边界测试在 `tests/usage-entry-boundary.test.mjs`。原 `services/ai-account-usage/` 与根目录同名测试已移除；没有转发壳或项目副本。原 Cookie Tool JSON、React 六 Tab、可信账号代码未改变，Node 源码不进入正式 Tool 包，未触发工具包晋升或 Browser 构建。

两个独立初审均发现同窗口诊断事件挤掉可靠周期、并发首次绑定重复身份；已按真实 domain／临时 HistoryStore 链先 RED 后修复。读取按窗口和证据类别分别限额；持久 3,000 事件上限优先保留已识别周期，余量保留诊断。Drawer 缓存失败回退不再二次混合截尾，虚构预览复用正式读取函数。并发身份唯一性在原文件锁事务内重验，冲突不落盘并返回明确错误；双方可能已经各发一次请求，不能声称跨进程联网前阻止重复。

原型六项测试原先在旧函数名和监听器拼写处全部失败，未实际执行行为。本轮修正驱动以调用现有统计、真实详情渲染与状态筛选，保留六项行为意图，没有调整原型产品代码迎合旧断言。CI 选择与漂移保护已覆盖迁移路径和验证驱动；两条浏览器报告都记录 checkout SHA、输入／驱动／产物哈希并核对执行前后不变。

### 当前候选验证

本机证据根：`artifacts/cookie-editor-usage-ownership/`（临时验证与报告，不充当正式源）。

| 验证 | 实际结果与边界 | 原始记录 |
| --- | --- | --- |
| 子模块 `npm test --prefix …/ai-account-usage`（原始日志经等价父别名调用） | 101/101 PASS、0 skipped，十二个额度文件及入口拒绝3项；不启动 Chromium | `owner-node-final.log` |
| 统计 TEST FIRST | 同窗口读取及 3,010 诊断风暴、3,001 已识别周期硬上限等7/7；含跨账号／窗口及未知估计 | `stats-followup/` |
| 并发首次身份绑定 | 两个服务、真实临时目录、两种提交顺序与独立读回3/3；模拟请求，不读取真实凭据 | `identity-race/` |
| Drawer／虚构适配器 | 20/501 诊断事件，成功读回与失败保留；小 limit 跨窗口一致，真实函数执行 | `drawer-fallback-red.log`、`drawer-fallback-green.log`、`demo-read-red.log`、`demo-read-green.log` |
| 正式／虚构 React 构建 | 均 PASS，仅额度子模块；未覆盖现有 watcher 或 `dist/development` | `production-build-final.log`、`preview-build-final.log` |
| Mac Chrome149.0.7827.55 正式 React＋同源模拟 API | 16/16 PASS；七可靠周期＋500诊断，失败回退保持；5次模拟POST、真实上游0 | `production-react-bound-v3/production-refresh-report.json` 与对应 stdout |
| owner发现／语法／CI配置 | 原 app-ci inspect PASS；42份已选源码解析PASS；56输入与生产3产物／生成预览哈希一致，浏览器绑定输入无漂移；YAML解析PASS | `app-ci-inspect-final.log`、`source-audit.json`、`workflow-parse-final.json` |
| 历史证据／正式包 | 10份旧证据逐字节保留，原 Tool JSON hash不变；不将历史成功升级为当前入口证据 | `preservation-check.json`、`candidate-manifest.json` |

未运行 GitHub远端CI、真实 Cookie Editor 账号入口、真实第二授权账号、七次自然重置、Cookie-only挑战重试、production扩展验收、全仓测试或缩放／宽度矩阵。未启动日常 Browser 环境，未停止其他 owner 的服务。本轮没有读取真实认证文件、修改真实历史库或查询真实上游。

### 仍未完成的用户操作

「Cookie Editor → 账号 → 已授权账号 → 对应额度管理页」仍为 **NOT_IMPLEMENTED**：现有 Cookie 快照身份不能证明 Codex OAuth 身份，且公开能力尚不提供原 Node 管理会话的可信发现和交付。该缺口已有原服务／listener／Host拒绝路径及公开合同证据，但不是正向功能通过。已有独立入口保留为「本机启动命令 → 一次性配对 → 既有 React 管理页 → 另行授权的 alias → 缓存／手动刷新」；原单账号真实成功仍只证明历史候选。

当前任务已经授权必要整改；阻断来自未实现且缺少可核验跨来源证明的合同，不是等待普通步骤批准。没有按显示名／域名／Cookie alias猜测映射，没有把秘密交给沙箱或新增虚假额度按钮。

持久历史仍为有界留存：已识别周期超过3,000时会全局裁剪，不能恢复旧版本已删数据，也不承诺每个账号／窗口永久保留。


## 两位独立专家最终复核

双方均按原完整目标评定，没有将目录整改子集当全目标通过。原始完整回复在本机证据根 `expert-a-final-v3.json`、`expert-b-final-v3.json`；它们是原生独立子 agent 的只读评审输出，不是签名审计或真实产品验收。

| 九维（0–100） | Sartre | Hypatia |
| --- | ---: | ---: |
| 统计正确性 | 97 | 95 |
| 证据真实性 | 98 | 94 |
| 缓存历史保留 | 97 | 92 |
| 查询独立读回 | 90 | 90 |
| 单请求停止边界 | 97 | 95 |
| 身份账号隔离 | 70 | 65 |
| 本地访问凭据保护 | 96 | 90 |
| 可用性无障碍 | 60 | 68 |
| 候选与证据追溯（含owner／消费者） | 94 | 93 |
| 算术平均／各自独立总评 | **799÷9＝88.78** | **782÷9＝86.89** |

**原完整目标：BLOCK / REQUEST CHANGES，未达到每维≥95、每位总评≥95且无阻断。** 两位均确认统计、并发、Drawer fallback、测试归属和原型HTML追溯缺口已闭合；剩余阻断是正式账号→可信来源身份映射→同一授权管理页的正向链未实现，及其真实会话失效／撤权验证缺失。没有用平均分掩盖身份、入口等低分。

其余证据边界继续影响评分：真实七次自然重置和第二授权账号不存在；历史有界裁剪；未覆盖完整Browser依赖闭包；远端CI与发布未执行。它们保留未测或留存限制，不为追分恢复延期矩阵、发起额外上游请求或改量表。

两位独立复核的来源恢复候选清单 SHA-256 为 `6d8f1def6045822400f98289d7d2cc96d8e3e56e95508cdd9cbcd44ce3e5fe4c`；两位均核对56输入＋3生产产物＋1生成预览共60项一致，v3浏览器报告47输入＋3产物一致，原始证据索引34/34一致。评审原文文件在索引核验之后保存，不冒称被该索引签署。

本轮改动保留在main未提交；开始观察HEAD `156e842ce2b416ee784518ab7aae1e914d63cd12`，收尾观察因其他owner正常提交前进至 `951e8b8639727a736c7ac7d2d1d60f5879931867`。该HEAD不是本轮未提交候选的源码身份，以上文件哈希用于补充绑定。未创建分支／PR／worktree，未覆盖并行工作。


### 正式包来源指纹收尾核对

Cookie Editor 的 `vite.config.mjs` 把父项目 `package.json` 纳入 `COOKIE_REACT_SOURCE_FILES`。本轮曾临时增加三个维护脚本别名，收尾时发现会使旧正式包来源指纹失效，已只移除这三个本轮脚本；父package与任务开始时逐字节相同。主README直接列子模块现有命令，不需要改父构建输入。Node101原始日志经当时等价父别名调用子模块相同test脚本，业务源码与测试未变化。正式包／receipt仅只读核对，不重编、不晋升或改包。候选和浏览器metadata重新绑定恢复后的父package。

收尾按专家非阻断意见，仅把README残留的 `start:usage` 文字改成现有子模块npm start命令；无需重跑产品或suite。最终清单SHA-256为 `9e039d4ab37e80de18faba3042536c9678231cc0bb16196f5cc7af6378daa7a7`，README及索引哈希已同步机械核对；源码、测试、产物和v3浏览器输入不变。该纯文案修正未再请求独立评分。
