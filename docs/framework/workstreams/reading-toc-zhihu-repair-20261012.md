# 系统 Chrome 知乎阅读目录诊断与修复

日期：2026-10-12（Asia/Shanghai）。负责人：本对话 `01a12e89`。状态：COMPLETE（当前知乎阅读目录使用恢复）；资源：released。

用户目标：修复日常 Chrome 中 `https://zhuanlan.zhihu.com/p/428602049` 的阅读目录。现场同时出现“暂无章节／此网站尚未授权或无法读取目录”和“已恢复本网站和当前页面的悬浮目录”。

初步事实：真实 Chrome Side Panel 的扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`；OpenDesk MCP status 的同一 ID、enabled、nativeConnected、connected 均正常，target 精确绑定该知乎页面。真实工具设置仅列出 `http://127.0.0.1:43111` 的网站授权，知乎当前未授权。已安装工具的错误文案早于当前源码，需核对工具包与页面注入。

修改范围：先通过真实 Chrome 设置修复当前页面使用所需的目录授权；若有代码缺陷，仅修改阅读目录与对应宿主、定向回归，不碰已有其他工作流改动。

通过条件：精确核对日常加载路径、扩展 ID 与 Native 配对；该知乎页面显示实际章节，点击能够定位；恢复提示不再把偏好保存误称为页面运行成功。保留组件与用户 Chrome 的证据等级，不宣称整体 F3/ZIP。

复用：已读 testing-guide.md、extension-loading-source-20261012.md、reading-toc-r46/r47-20261011.md。旧受控 CI 不替代本次实际知乎验证；未变化的 Native 安装与其他框架业务不重复验收。

资源：本轮占用用户明确要求修复的日常 Chrome 当前知乎页与其 Side Panel；不占用其他 CFT/Profile、43111、生产 dist 或 ZIP。不直接改 Chrome Preferences、Native 配置或工具存储。开发 dist 如需更新，先核对现有 dev 进程。提交、推送、发布均不在本轮范围。

## 原因和实际修复

- 知乎当前 origin `https://zhuanlan.zhihu.com` 未在阅读目录的站点授权列表；此前“已恢复”是显示偏好操作的历史提示。显示偏好与运行授权独立，不能根据该提示判断当前页面可读取。源码 `toggleTocDisplay()` 已在操作时验证站点授权，不需要为现场现象制造代码修改。
- 在真实日常 Chrome 的“阅读目录 → 工具设置 → 授权当前网站”点击授权；设置变为“当前网站已授权”，新增该具体 origin，保持原 `http://127.0.0.1:43111` 授权。
- 无产品源码、工具包、dist、Native 安装或 Chrome Preferences 修改；仅通过既有受信 UI 保存此次站点选择。本轮只新增本工作流记录。

## 实际验证（限定用户 Chrome）

1. 只读 Secure Preferences：Default Profile 中该 ID 的路径为 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，location=4。
2. 真实 Go `browser doctor`：connected=true；local.extensionId 与真实响应均为 `ccfcjegpkdlgbclopjmadlcjedelidmf`；nativeConnected=true、enabled=true，requestId=`951227ef-7af1-400f-9fa6-d433bd792ef5`。Native manifest 的 allowed_origins 仅为此 ID。
3. 授权后真实网页出现“网页目录”，Side Panel 的“章节导航”出现“每个人都要做好时间管理”“时间管理必须牢记的一个原则”“四大方法助你轻松做好时间管理”“写在最后”等实际按钮；原空目录错误消失。
4. 用真实 Side Panel 按钮点击“写在最后”；工具截图显示该正文标题位于网页可视区域顶部，悬浮目录也高亮该章节。未使用 DOM 赋值、合成事件或模拟 ack。
5. 通过 Chrome 原生“重新加载”刷新同一知乎页面；加载完成后网页与 Side Panel 目录均重新出现，站点授权和显示偏好保留。

Chrome 原生状态与点击后截图由本对话 `mcp__cua_repl` 工具返回；以上为现场观察摘要，未伪造本地截图文件或正式验收 receipt。目录还收录页面的推荐阅读标题，属于现有正文识别范围的附带观察，未在本次空目录修复中修改索引行为。已安装工具错误文案早于当前源码，但授权后其现有目录读取/跳转可工作，未无故升级安装包。

输入身份：HEAD=`37fae06f3a7edf5d1c14eda4772f1e10c5213872`，含其他工作流未提交差异。相关 SHA-256：

- `src/ui/sidebar-tools.js`：`3324ac8089ca0e3e73ab4018d3c4c3b27e211579c6371aff0153acb766d8c959`
- `src/reading-toc/policy.js`：`412b800b0d61466c636cd3c8c1e79ff12e8d25bfb9dc5941b05faa3b4d760616`
- `src/reading-toc/model.js`：`afba4f68910e836d20193c5bad122e8a7244677ea0157df814eb7107642ba109`
- 实际目录 `dist/development/manifest.json`：`ff95488528884f4d4a617ace287d64d834665508a7eadb1d5195b1d4293f724f`

验证结论：当前用户 Chrome 的本站授权、目录显示、真实点击定位与刷新恢复 PASS；无源码变化，不重复组件/构建/全量回归。其他网站、正式 F3、ZIP 和整体迁移未在本轮验收。不覆盖旧 receipt。资源已释放。

## 用户追加：阅读目录默认用于所有页面

状态：COMPLETE（内置阅读目录默认可用策略与用户 Chrome 定向验证完成）。用户明确要求默认授权所有页面；本轮范围为内置 `reading-toc` 的 HTTP(S) 目录读取/导航和悬浮显示。第三方工具、剪藏、知识保存以及 Native/USER_SCRIPT 的权限保持各自合同。

实施计划：`src/reading-toc/policy.js` 为内置目录统一定义“默认可用、按 origin 停用”的策略，兼容已有站点数组；`src/ui/sidebar-tools.js` 的读取、显示、设置和例外列表都采用这一决策，保留工具停用与单页排除；更新相关定向回归和目录文档。异常数据继续保守拒绝，普通非 HTTP(S) 页面继续不可用。

通过条件：未曾逐站点授权的普通网页自动出现目录；站点停用、单页排除、工具停用、卸载和旧实例失效仍有效；第三方工具不能继承内置默认权限。先做定向测试，再更新日常 `dist/development` 并通过真实 Chrome 操作验证。仅本轮占用日常开发 dist/Chrome，不占用其他 CFT/生产 dist/ZIP。只读 subagent 检查遗漏，main 单一 writer。

### 实施与兼容

- `src/reading-toc/policy.js` 统一内置目录的默认 HTTP(S) 可用性，沿用原存储键，以 `{mode:'all-except',blockedOrigins:[...]}` 保存网站停用例外。旧正向数组按用户新要求兼容为默认全部可用；旧数组无法表达过去撤销的网站，不能臆造停用记录。畸形数据仍拒绝访问。
- 宿主读取、真实文档导航、悬浮显示、设置、网站与页面例外采用相同判断；保留已安装能力、工具启停、单页排除、文档身份、撤权 epoch 和安装锁。共享 `changeTocGrant` 仍是正向授权，剪藏、知识与其他 ID 的导入工具不会继承内置默认权限。
- 设置显示“当前网站可用性”“停用当前网站”“已停用的网站”，应用市场与当前 API/产品文档同步说明默认策略。工具包升至 1.0.4；读取异常显示实际宿主错误，避免把所有失败都归为缺少授权。

### 最终证据与现场操作

原始日志与输入摘要位于 `evidence/reading-toc-default-sites-20261012/`：

1. `targeted-current.tap`：187/187 PASS，0 fail/skip。包含默认 HTTP(S)、旧设置、损坏设置、网站停用/恢复、单页排除、工具停用/卸载、第三方 TOC、剪藏、知识、宿主与市场回归。
2. `source-check-current.log`：490 个源码/测试/构建文件语法、构建入口、CSP 与许可证检查 PASS；原生 runner 语法检查与 `git diff --check` 通过。受控 CFT runner 本轮 NOT_TESTED。
3. 私有源快照 `standalone-current/build-production.json` 与 `build-production-current2.log`：production 构建及包校验 PASS，83 assets，packageHash=`9e3457e02d236d432edb49629fff6b74927b872911babfd423d50c07031935c1`；无构建中源漂移。`ui/tool-shell.js` 414877 B 超过软审阅阈值、低于硬门槛，包含共享工作区已有功能，未为本任务扩大处理范围。私有构建未写日常/正式生产 dist 或 ZIP。
4. Chrome 原生扩展详情确认固定日常加载路径、真实 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，网站访问本来就是“在所有网站上”。此前拦截来自阅读目录内部逐 origin 授权。保持原 Native 配对；`doctor-final.json` 再次 connected/nativeConnected/enabled=true，ID 完全一致。
5. 通过真实市场审阅 UI 将已安装阅读目录 1.0.2 更新至 1.0.4，能力仍为 page.toc，没有新增能力；重新加载同一个日常扩展与网页。Chrome 现场观察 revision=`8a8c03919f5b01d52cb3d20331ce36a6bb7a7b6806b9613127afdcee747535e2`。
6. 未逐站点授权的新 `https://example.com` 已出现悬浮“网页目录”，侧栏读取成功且不再报未授权；该页没有识别到章节，因此目录为“暂无章节”，不将空索引冒充章节发现。点击“停用当前网站”后浮层消失、状态变为已停用；点击“启用当前网站”立即恢复，停用列表清空。临时测试标签页已关闭。
7. 回到原知乎文章，刷新后悬浮与 Side Panel 均列出实际章节；真实点击侧栏“写在最后”，截图显示同名正文标题位于页面顶部，目录高亮一致。浏览器最终停留在该文章及阅读目录。

`input-and-native-observations.json` 保存源码 SHA-256、日常构建 revision、工具版本、Go 配对与 CUA 观察摘要。它是现场观察记录，不是受控原生/F3/ZIP receipt。源码工作期间另有并行会话更新共享文件，保留其差异；`standalone-source-refresh.json` 记录私有快照更新，不覆盖主工作区。记录时日常 dev revision 已因其他源码更新推进到 `86ba4b2cf9521848b6cc88416b08ef458edb9280023405608d0a6e18df5d3ca4`，不把后续 revision 冒称为上述 Chrome 现场验证身份。

### 环境恢复、失败保留与资源交接

- 首次 dev 启动发现现有声明依赖 `@fingerprintjs/fingerprintjs@5.3.0` 缺失；按锁文件精确版本恢复并校验 tarball integrity，不增加依赖，不改 package/lock。`dev.log` 保留失败，`dev-recovered.log` 为恢复后的开发服务。
- 活跃 development 目录含 `development-update.json`，独立发行包校验器拒绝其额外运行元数据（`verify-development.log`）；未放宽校验器，改用私有源快照构建。首次快照 node_modules symlink 被构建 provenance 拒绝，改为私有副本。错误 cwd 的后续调用被已有输出 owner 锁阻止，日志保留；修正 cwd 后私有构建通过，未停止/覆盖日常 dev。
- 初始定向回归失败、构建失败及后续成功日志均保留，不重写旧 receipt。普通非 HTTP(S) 页面及 Chrome 自身受限页面仍受浏览器限制；本轮不做全量框架、受控 CFT、最终 F3、ZIP 安装或发布验收。
- 日常 `npm run dev` 持续运行：npm PID=82944，输出 owner PID=82965，会话=16068；该进程继续维护固定 `dist/development`，不再启动第二个日常输出 owner。用户 Chrome 临时测试占用已结束，保留原文章可用状态。没有提交、推送或发布。
