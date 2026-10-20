# Web Markdown Clipper R1.7.5-LOCAL · Mac 本地验收记录

2026-10-21，结论：**核心操作已有真实 Chrome 证据，完整正式验收尚未通过。** 不能宣布本阶段完成或全面 UX 95+。

1. **原生右键剪藏：PASS（指定测试环境）。** 真实鼠标选中指定中文、Chrome 原生右键菜单打开已安装工具、一次保存后打开核对正文与来源。1.1.2 升级后重新授权右键，再次剪藏成功。
2. **退出重启持久化：PASS（正常退出）。** 关闭侧栏重开、完全退出 Chrome 并确认进程结束后，以相同 Profile 重启均可读回。升级后的 1.1.2 再次退出、重启，三条记录仍存在。不涵盖崩溃、强杀或断电。
3. **1.1.0 原位升级：PASS（指定样本）。** 同 ID 升级至 1.1.2，两个已编辑旧记录逐字保留，正文 Origin 授权保留；右键授权没有自动继承，重新启用后可用。提交前取消升级保留旧记录；提交中途失败回滚 NOT_TESTED。
4. **日常操作：有条件通过。** 搜索、编辑、删除及重新打开读回通过。新增持续开发 Host 已实测单击复制、Markdown 下载，无额外 Host 确认或 SaveAs；`pbpaste` 与磁盘文件读回正确。JSON 备份解析正确，但鲜读后仍需 Host 确认和保存对话框，**单击备份 UX 尚未满足**。新 Host 尚未获得 production 候选证据。
5. **UI：修复一项真实颜色故障。** 旧版深色错误文字对比度 2.717:1，1.1.2 为 8.842:1；浅色保持 5.574:1。未改布局或业务 JS。360/400/440px 浅深主题、真实 200% 下 320 CSS px 主要界面未见横向溢出；原生 Tab 到复制并 Return 成功。完整键盘编辑/删除/下载旅程仍 NOT_TESTED。

**环境与身份边界**

- 首轮源码基线 `main`：`3539699dcf0d74d0ad526ca5d7ca9ccbb62bd73b`；已保留远程并行提交并安全合入、推送 `89a00e4bb0d57c06e3a016b878103c493a4067bf`。本次续验以该 SHA 叠加明确列出的工作区改动，独立构建输入见 `source-current-inputs.json`。本轮提交和最终 main SHA 见交付答复及 Git 记录，不将本文件自身的 SHA 写进自身。
- 真实浏览器：Mac Google Chrome for Testing 149.0.7827.55，独立 `chrome-profile` 与 `upgrade-profile`。未访问或改写个人 Profile、Native 配对配置。
- **旧版安装、升级和早期操作使用诊断静态 production Host，非 latest-main 新构建候选**：证据目录 `diagnostic-static/`，扩展 ID `bceilljffabklddhgijaknoobajpgfmp`。旧成功回执摘要 `4307e7ef219184b6612c35af41da3af14804f74b39e8acbb9c25c85a369a6b2b`；不能作为当前正式发布候选。
- **新 Host 复制/下载复验使用持续开发环境**：原有 watcher 输出 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，新的独立 `dev-profile`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。页面实际显示“开发服务已连接”，最终指纹 `033bf5e13c0aee5f7a348bfd971bdf9ec2dd6f146d3c24bf21ef4debac9e1717`；Bridge/Host 输出摘要与该指纹清单一致。它是当前工作区的开发证据，包含并行工作区输入，不冒称纯 committed-main production。
- 运行期间保护原 `npm run dev` writer（当时 PID 4625）、`dist/development` 和 43120 输出守卫；没有覆盖输出、切换日常扩展或停止其他 Chrome。收尾只读观察时该 PID 与 43119/43120 listener 已不存在；本轮未发送停止命令，也未擅自重启所属服务。
- 网页为受控本机 HTTPS：`https://localhost:43180/demo-form.html`，沿用规范 demo-form 页面，仅在服务器响应中替换示例文字。使用测试自签名证书并经过 Chrome 证书页面继续；**不是公共网站实测**。未授权 Origin 另用 `https://127.0.0.1:43180`。
- 选区及右键使用有进程/前台保护的 macOS CGEvent；菜单证据含 AXMenuItem 与系统截图。普通按钮使用 Chrome Input 事件，文件输入走真实导入审阅 UI。没有 DOM 伪造右键、没有直接写 Storage 构造成功。安装后的 Storage 只读用于核对版本和载荷摘要。
- 当前实际安装载荷 HTML/CSS/JS 的 SHA 均与正式 1.1.2 JSON 一致，见 `dev112-installed-identity.json`；业务 `main.js`、固定 `notes.js` 与 1.1.1 完全相同，能力声明未改变。早期完整日常操作在 1.1.1 验证；持续开发 Host 的右键、保存、重启、复制、Markdown 下载和 JSON 备份已用实际安装的 1.1.2 再次操作，未声称全部异常路径又重测一遍。

全部原始文件保留在本机忽略目录：[本轮证据](</Users/shopme/Documents/workspace/opendesk-browser/artifacts/web-markdown-clipper-r1.7.5-local-20261020-01a15a04>)。测试 Profile、临时构建、证书和密钥不提交；不要公开上传整个 Profile。

**逐项操作与证据**

| 操作 | 状态 | 实际结果 / 证据文件（均在上述目录） |
|---|---|---|
| 原生右键 → 预填 → 保存 → 打开 | PASS | `context-menu-native.png`、`native-context-menu-real.txt`、`saved-current-readback.json`、`opened-note-current.json`；中文全文和 localhost HTTPS 来源一致 |
| 关闭侧栏再打开 | PASS | `reopened-panel-readback.json`，一条完整记录 |
| 完全退出 Chrome 再启动 | PASS | `browser-exit-receipt.json`、`browser-restart-readback.json`；旧 PID 45644 结束，同 Profile 新 PID 49237 读回 |
| 中文搜索 / 编辑并重新打开 | PASS | `search-readback.json`、`edited-note-readback.json` |
| 旧诊断 Host 复制 / pbpaste | PASS（需二次确认）；新 Host 已修复单击 | `clipboard-readback.json`，93 UTF-8 字节，精确为“这是一条用于 OpenDesk Browser 真实验收的中文摘录。编辑后仍完整保留。” |
| 旧诊断 Host Markdown 下载、磁盘读回 | PASS（需二次确认与 Save As）；新 Host 见下文 | `chrome-downloads-readback.json`、`download-readback.json`，实际文件完整包含指定中文 |
| JSON 备份、解析读回 | PASS（需二次确认与 Save As） | `downloads/web-clipper-notes.json`，一条记录，编辑后的完整正文和来源正确 |
| 删除并重新打开 | PASS | `delete-readback.json`、`delete-reopen-readback.json` 均零条；没有以提示文字单独判通过 |
| 重复保存同一摘录 | PASS | `duplicate-save-readback.json` 显示“没有重复创建”，`upgrade-continued-readback.json` 数量保持三条 |
| Ticket 再次消费 | PASS（SDK 负例） | `ticket-second-consume-readback.json`：`E_LAUNCH_EXPIRED`；不是第二次投递正文 |
| 未授权 Origin 正文读取 | PASS | `unauthorized-origin-112-readback.json`：拒绝授权提示，正文长度 0 |
| Origin / documentId 替换、撤权竞态 | NODE PASS / Chrome NOT_TESTED | `sdk-node.log` 中相应 R1.1/R1.3 负例通过；没有将 Node 负例称为原生故障注入 |
| 2049 字节正文拒绝与恢复 | PASS（UI 校验） | 真实输入 683 个“中”，错误明确、不截断、草稿保留；取消后原记录未变，见深色错误截图及升级读回 |
| 保存真正落盘失败的 UI 反馈 | NODE PASS / Chrome NOT_TESTED | 无真实 Chrome 存储故障注入；定向测试覆盖确认未写入可恢复、未知结果停止后续写入 |
| 2048/2049、clips 整键 8192/8193、并发与配额 | NODE PASS / Chrome 故障注入 NOT_TESTED | `clipper-112-boundary-gate.log`，精确边界拒绝不写入、Promise.all stale ETag 重试、Host quota 拒绝保留旧数据；`host-storage-export.log` 验证真实 Host 实现的模拟输入 |
| 1.1.0 → 1.1.2 原位升级 | PASS（样本） | `upgrade110-to112-confirm.png`、`upgrade-old-all-records.json` 与 `upgrade-new-all-records.json` 461 字节逐字相同：一条网页摘录、一条手动便签，均在旧版中编辑 |
| 正文授权保留 / 右键授权重置再启用 | PASS | `upgrade-old/new-body-authorized.json`、`upgrade-new-body-grant.json`、`upgrade-context-reset-readback.json`、`upgrade-context-reenabled.json`、`upgrade-new-native-menu.png` |
| 取消升级 / 中途失败回滚 | PASS（取消时一条便签） / NOT_TESTED（中途失败） | `upgrade-cancel-readback.json`；未注入升级提交中的存储故障 |
| 升级后再完全退出、重启 | PASS | `upgrade-browser-exit-receipt.json`：PID 51885 不存在；同 Profile 新 PID 53564，`upgrade-restart-readback.json/png` 三条记录完整 |
| 360 / 400 / 440px 浅色和深色 | PASS（列表主要操作可见） | `ui-width-readback.json`、各宽度 light/dark PNG，scrollWidth 等于实际宽度，clippedControls 为空；不是全部页面与状态矩阵 |
| 320px / 200% | PASS（指定主要界面） | 原生 Chrome 菜单将同扩展标签页放大到 200%，侧栏 DPR 2→4、360→180 CSS px；原生拉宽到 640 DIP 后实测 320 CSS px。`native-zoom-panel-200.json`、`native-320-200-readback.json`、浅深截图；未做 CSS 缩放。100% 下原生最小宽度仍 360 DIP |
| 焦点 / ARIA | 局部 PASS；完整键盘 NOT_TESTED | `dev-final-keyboard-copy.json`：原生 Tab 依次经过返回、新建、搜索、刷新、备份、打开、复制，focus-visible 均为 true；Return 后 `dev-final-keyboard-pbpaste.txt` 精确读回。未声称完成所有键盘旅程 |
| 新 Host 单击复制 / Markdown 下载 | PASS（持续开发） | `dev-final-keyboard-host.json` 确认无 Host 审阅；`dev-final-download-readback.json` Chrome complete、磁盘 4394 字节正文正确，无 SaveAs |
| 新 Host 退出、同 Profile 重启读回 | PASS（持续开发，正常退出） | `dev-exit-restart-receipt.json` 旧 PID 62228 不存在，同 `dev-profile` 新 PID 63042；`dev-final-restart-notes.json` 实际 UI 一条完整中文记录，新进程收尾也已退出 |
| label 转发的第二次导出 | PASS（持续开发安全反例） | 独立测试包由真实安装 UI 审阅；一次实际点击产生两个同时间戳 trusted click。`dev-label-forward-events.json`；首次复制成功，第二次被 Host 确认拦截，`dev-label-forward-downloads.json` 为 []。未以测试包代替 Clipper 核心链 |
| fresh-main Browser / Native 正式候选 | BLOCKED | 完整构建和产物校验未通过；上述诊断 Host 实测不替代正式候选 |

**实际文件读回**

- Markdown 原始磁盘路径：`/Users/shopme/Downloads/OpenDesk Browser · Browser Test Lab.md`，4394 字节，SHA-256 `3c15dfe5f2b24954cf063ca08dc868c291362a2e6e631016684e2d1e5042ef50`。读回后复制到证据目录 `downloads/`，未以副本代替首次实际路径检查。
- JSON：证据目录 `downloads/web-clipper-notes.json`，477 字节，格式 `opendesk.clipper-notes.backup.v1`，SHA-256 `557c84830b865955634b1c03436ded5c3ed7b7916aae2d5a2e67d5bc912267de`。
- 新 Host：`dev-final-keyboard-pbpaste.txt` 为指定中文 66 UTF-8 字节；`dev-final-download-readback.json` 核对实际 `/Users/shopme/Downloads/OpenDesk Browser · Browser Test Lab (1).md`，4394 字节、SHA 与上述 Markdown 相同。`dev-final-backup-readback.json` 核对实际 `downloads-current/web-clipper-notes.json`，格式、记录数量及全文正确，同时记录仍经过 Host 确认与保存对话框。
- 历史 1.1.0：从 `d7ac64f00010dadf3a0bf974e34cd6a3b526d1e1` 归档源文件及同提交打包器，未改历史源重建包，SHA-256 `15434da7d8d82a0d946a4553c7850c7e0d64518c4010b80e7d747f80b5d99fde`。`historical-provenance.json` 核对归档文件与 Git 原文相同；它是可信历史源码重建包，不冒称历史发布时的原始二进制附件。

**故障、根因、修复与复验**

1. **深色错误文字偏暗：已修复。** 真实输入正文超限后，1.1.1 仍使用浅色错误色 `#b14251`，落在 `#202633` 深色背景，仅 2.717:1。只在原 dark media query 增加 `#ffb1bb`，1.1.2 实际安装后为 8.842:1，light 仍 5.574:1。浏览器 prefers-color-scheme 仿真期间保持 CDP 会话，截图与 computedStyle 同时读取；未声称切换了 macOS 系统主题。对照普通文字 [WCAG 对比度说明](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。
2. **普通同步导出多一次 Host 确认：已修复并在持续开发环境复验。** 公开 SDK 只能进入旧 Host 确认，工具内无法合法解决，故修复既有 Bridge/Host 通路：启动时捕获原生事件 getter 与端口方法，以挂载实例的闭包私有 MessagePort 证明真实点击派发中的一次导出，继续使用原 `browser.intent.confirm`、精确参数、能力、包/epoch/instance 检查。没有新增 Authority、安装器或 Clipper 特判；Cookie 保留原站点门禁。后台窗口消息和派发结束后的请求仍进入 Host 审阅。独立复核发现 label→checkbox 会转发相同时间戳 trusted click；已捕获原生 timeStamp 去重消费，19/19 回归及真实 Chrome 反例证明第二次导出被拦截，复核者确认关闭 MEDIUM。JSON 备份保留 `await reload(true)` 鲜读，不能沿用已结束的点击，额外确认仍未解决；未用陈旧缓存换取单击。
3. **最初 `--check-project` 失败：旧正式 JSON 缺末尾 LF。** 发布 1.1.1 原始 SHA `758cdf571f54db420a005e7d96d093fe2a5f84f6f814dc9bdebb3b62ddefa580`；解析后全部字段与同源候选一致，不能解释为业务载荷漂移。没有就此改写已发布 1.1.1。真实 CSS 修复升 1.1.2 后，经原打包器候选、定向门禁、`--promote-from`、`--check-project` 闭环通过。
4. **root build 输出守卫拒绝：保留其他会话 watcher。** 未停止 writer；改用原 build 机制在 Git 归档快照、独立输出守卫 43179 构建。随后仍实际失败于无关 Prompt Shortcuts 的 `src/style.css:178` 私有阴影颜色 `#00000015`，触发 `E_PREVIEW_DESIGN`。未修改别的工具来凑绿色。
5. **旧 production 的 React 扫描误判：精确修复。** 实际表达式 `(local=Component.prototype=new Parent).constructor=Component` 是既有已允许原型修复被 Terser 折叠后的形式。只在 npm 锁定 React、固定 shell、同一词法组件绑定、本地空 helper、非计算属性和普通赋值下允许；构造器读取、调用、错配、计算属性等继续拒绝，8/8 定向测试。旧包随后仍因内置 1.1.1 与当前 1.1.2 同源不一致停止，不冒称完整校验通过。
6. **输入自动化问题已与产品问题分开。** 早期 Cmd+A 驱动没有发 selectAll、部分原生点击前台丢失被拒绝、关闭侧栏后网页重排使旧坐标失效，均修正辅助驱动并读取实际结果；没有为这些驱动问题改业务代码或计作成功。
7. **新 production 来源锁阻断：未绕过。** 独立快照最初因 node_modules 软链接位于快照外被拒绝；复制现有固定依赖后，构建停在 `src/analytics/host.js` 将 Prompt model/policy 导入 SW。既有 R14 测试明确禁止这两个业务模块进入 SW；未添加白名单或降低该断言。需该模块 owner 修复边界，fresh-production 和其 Browser/Native CI 仍 BLOCKED。
8. **共享 CI 夹具已修复。** R22 改查现有 React 列表/市场入口；所有权测试允许既有 `files.dependencies` 本地脚本声明并继续拒绝 trusted；构建回执测试核对当前准确错误；嵌套 CLI 清除 `NODE_TEST_CONTEXT`，避免 Node 跳过失败测试却 exit0。13/13 夹具与最终 72/72 Host/SDK/React 测试通过，安全与权限断言保留。

**命令与实际退出码**

root 命令逐条日志在 `command-logs/`，`results.json` 保留各次实际退出码。新 Host 修改后做受影响验证；只有相关输入或环境变化后才重建，未覆盖日常 watcher。

| 命令 | exit | 结果 |
|---|---:|---|
| `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project` | 初次 1；1.1.2 为 0 | 见上述 LF 根因和新版同源回执 |
| `shasum -a 256 examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json` | 0 | 当前摘要见下文 |
| `node --test examples/sidebar-tools/web-markdown-clipper/tests/notes.test.mjs examples/sidebar-tools/web-markdown-clipper/tests/ui.test.mjs` | 0 | 初次 25/25；新增边界测试后与打包门禁一起 35/35 |
| `node --test tests/environment/browser-sdk-context-menu-r11.test.mjs tests/environment/browser-sdk-r13.test.mjs tests/environment/markdown-tools-r22.test.mjs` | 最新 0 | 45/45；并行 Prompt CSS 修复解除五项前置失败，旧目录断言修正。原失败日志保留 |
| `APP_CI_SELECTED=web-markdown-clipper node scripts/app-ci.mjs plan` | 0 | 选择 Clipper，要求 browser/native |
| `node scripts/app-ci.mjs inspect web-markdown-clipper` | 0 | chrome=true，native=true，kind=page |
| `node scripts/app-ci.mjs build web-markdown-clipper` | 1 | 43120 live writer 输出守卫拒绝 |
| `node scripts/app-ci.mjs node web-markdown-clipper` | 最新仍 1 | 109/109 断言通过，随后因 production 构建未生成 candidate-receipt.json 而 ENOENT；不能把测试断言通过当整个命令通过 |
| `npm run check` | 0 | 源码检查通过 |
| `npm run build`（root） | 1 | writer 输出守卫 |
| `npm run build`（独立快照，43179 guard） | 1 | Prompt Shortcuts CSS 的 E_PREVIEW_DESIGN |
| Clipper candidate `--out artifacts/sidebar-tools/web-markdown-clipper/candidate.opendesk-tool.json` | 0 | validated=true |
| `node --test …/notes.test.mjs …/ui.test.mjs tests/environment/sidebar-tools.test.mjs` | 0 | 新增边界后 35/35 |
| `node --test --test-name-pattern='storage\|ETag\|quota\|canonical exports\|R14 preview' tests/environment/sidebar-tools-host.test.mjs` | 0 | 10/10，包括双面板存储锁、ETag、配额、升级保留数据、精确一次性导出授权 |
| 同一打包器 `--promote-from artifacts/sidebar-tools/web-markdown-clipper/candidate.opendesk-tool.json` | 0 | `promote-112.log`，随后 `check-project-112.log` exit 0 |
| `node --test …sidebar-tool-export-bridge-host.test.mjs …verify-package-react-constructor.test.mjs …browser-sdk-context-menu-r11.test.mjs …browser-sdk-r13.test.mjs …markdown-tools-r22.test.mjs` | 0 | 最终 72/72，`final-host-sdk-react-gate.log` |
| `node --test …app-ci.test.mjs …tool-stage.test.mjs …app-business-ownership-r1.test.mjs` | 0 | 13/13，`shared-ci-fixture-repair.log` |
| `npm run check`（新 Host 后） | 0 | 检查 953 文件，`check-host-export-current.log`；最终源码复核另见 `final-source-check.log` |
| `node scripts/app-ci.mjs build web-markdown-clipper`（独立快照、43179） | 1 | 依赖路径修复后，Prompt model/policy→SW 来源锁拒绝，`isolated-app-build-local-deps.log` |

Browser/Native 正式 CI 因完整候选前置失败未继续，状态 BLOCKED；实际 Mac 操作按上表逐项记录。远端 [GitHub Actions](https://github.com/shopable-ai/opendesk-browser/actions) 仅作运行入口：本轮未取得绑定最终 main 的 CI PASS 链接，不能把其他 SHA 的 CI 当本轮结果。本机无 `gh`（exit 127）；Connector 对观察到的远程 SHA 返回 statuses=[]，这不证明 Actions 绿色或没有运行。

**本轮改动与正式包**

- `src/style.css`：仅深色错误文字颜色，修复实际对比度缺陷。
- `tool.config.json`、唯一 `web-markdown-clipper.opendesk-tool.json`：不可变版本升 1.1.2；原打包器构建、门禁后晋升，不更换 ID、能力或业务 JS。
- `tests/notes.test.mjs`：按本轮要求补精确字节边界、并发 CAS、Host 配额拒绝测试；模拟 CAS 拒绝返回真实合同的冲突码。
- `README.md`：澄清整个 clips 键值配额，修正唯一正式安装包及候选晋升说明。
- 本记录：保留成功范围、失败、NOT_TESTED 和原始证据位置。
- `src/sidebar-tools/bridge.js`、`src/ui/sidebar-tools.js`：修复普通同步导出重复确认，保留既有 Host intent、Cookie 与撤权；新增 19 项安全回归。
- `scripts/verify-package.mjs` 与 React 扫描测试：修复实际压缩 AST 误判，保留危险构造器拒绝。
- 四份共享环境测试：修复上述实际 CI 夹具失配，不改权限、来源或升级业务。
- `docs/api/browser-sdk.zh-CN.md`：说明真实点击单次导出及异步请求保留确认的实际边界，不新增 API。

正式可导入包：[web-markdown-clipper.opendesk-tool.json](/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json)，版本 **1.1.2**，41277 字节，SHA-256 **`4e86bde94969ab9691bfaea9c52e47c34ec50059155369145f72c40c6d4c6fda`**。它通过工具级门禁并已真实安装，**不等于整个 Browser 新 production 包正式验收通过**。

**五位独立专家审阅**

以下为续验后的五位独立复评，评分仅覆盖已核对的证据；未验证的 fresh-production、完整键盘与故障注入不计为通过。首轮较低评分保留在 Git 历史及原始专家记录中，没有由主 Agent 擅自提高分数。独立安全审查另发现并复核关闭了 label 转发的 MEDIUM。

| 专家 / 独立 agent | 已验证范围评分 | 证据、主要风险与未测范围 |
|---|---:|---|
| 产品 UX、颜色与交互 / Dalton `01a15a59-cac4-7331-88a1-43f9fae714dd` | 90 | `expert-final-ux.md`；浅深颜色、真实 320/200%、原生 Tab/Return、单击复制；异步备份额外确认尚未解决，完整键盘及全部状态对比度 NOT_TESTED |
| Chrome SDK 与原生右键 / Lorentz `01a15a57-bdee-7021-8afb-1b18f7c3e7d6` | 93 | `expert-final-chrome.md`；新 Host 原生菜单、保存、复制、磁盘下载与转发点击保护；SDK 全接口及 fresh-production NOT_TESTED |
| 存储可靠性 / Mill `01a15a57-bbc7-7600-9223-10c9b582125b` | 94 | `expert-final-storage.md`；重启、升级两个记录逐字保留及真实文件读回，边界/CAS/quota/unknown Node 证据；真实异常注入及 fresh-production NOT_TESTED |
| 权限、安全与旧版升级 / Pauli `01a15a57-bcea-7dd3-a8c3-6876201b4cf6` | 94 | `expert-final-security.md`；旧数据、正文授权保留、右键重置再启用、未授权拒绝与 Ticket 单次消费；中途失败回滚及 fresh-production NOT_TESTED |
| 构建、测试与发布 / Boyle `01a15a5a-2e46-7832-849d-1906b93a7562` | 85 | `expert-final-build.md`；72/72、953检查与工具同源门禁；109断言虽通过整条 CI 命令仍 exit1；新 production 构建 BLOCKED，没有最终 SHA 的 CI PASS 链接 |

**尚未关闭的交付阻断**：fresh-main production 构建被统计模块的 Prompt→SW 来源边界阻断，因此正式 Browser/Native 候选尚未通过；JSON 备份仍需 Host 确认；完整键盘旅程及升级提交中途失败回滚 NOT_TESTED。R22 45/45、单击复制/Markdown 下载、320 CSS px/真实 200% 和 label 转发保护已有新增证据，但不提升为整个正式阶段完成。未发现已测正常保存链丢数据，仍不承诺所有故障场景无数据丢失。
