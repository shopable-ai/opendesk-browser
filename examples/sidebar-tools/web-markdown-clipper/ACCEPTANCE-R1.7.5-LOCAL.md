# Web Markdown Clipper R1.7.5-LOCAL · Mac 本地验收记录

2026-10-21，结论：**核心操作已有真实 Chrome 证据，完整正式验收尚未通过。** 不能宣布本阶段完成或全面 UX 95+。

1. **原生右键剪藏：PASS（指定测试环境）。** 真实鼠标选中指定中文、Chrome 原生右键菜单打开已安装工具、一次保存后打开核对正文与来源。1.1.2 升级后重新授权右键，再次剪藏成功。
2. **退出重启持久化：PASS（正常退出）。** 关闭侧栏重开、完全退出 Chrome 并确认进程结束后，以相同 Profile 重启均可读回。升级后的 1.1.2 再次退出、重启，三条记录仍存在。不涵盖崩溃、强杀或断电。
3. **1.1.0 原位升级：PASS（指定样本）。** 同 ID 升级至 1.1.2，两个已编辑旧记录逐字保留，正文 Origin 授权保留；右键授权没有自动继承，重新启用后可用。提交前取消升级保留旧记录；提交中途失败回滚 NOT_TESTED。
4. **日常操作：有条件通过。** 搜索、编辑、删除及重新打开读回通过；复制经过额外 Host 确认后，`pbpaste` 精确匹配正文；Markdown 与 JSON 备份经过 Host 确认及 Chrome 保存对话框后，已读取磁盘核对。**用户要求的复制、下载单击直接完成仍 FAIL。**
5. **UI：修复一项真实颜色故障。** 旧版深色错误文字对比度 2.717:1，1.1.2 为 8.842:1；浅色保持 5.574:1。未改布局或业务 JS。360/400/440px 浅深主题未见横向溢出；实际 320px、200% 缩放及完整键盘旅程 NOT_TESTED。

**环境与身份边界**

- 源码基线 `main`：`3539699dcf0d74d0ad526ca5d7ca9ccbb62bd73b`。收尾 fetch 观察到远程 `main`：`a75b0b0d5461c968cc72d60a3441961398d75471`，其新增内容为 AdBlock 预览及 React 预览 HTML。本轮提交和最终 main SHA 见交付答复及 Git 记录，不将本文件自身的 SHA 写进自身。
- 真实浏览器：Mac Google Chrome for Testing 149.0.7827.55，独立 `chrome-profile` 与 `upgrade-profile`。未访问或改写个人 Profile、Native 配对配置。
- **实际加载的是诊断静态 production Host，非 latest-main 新构建候选**：原始证据目录内的 `diagnostic-static/`。固定扩展 ID `bceilljffabklddhgijaknoobajpgfmp`。其旧成功构建回执包摘要 `4307e7ef219184b6612c35af41da3af14804f74b39e8acbb9c25c85a369a6b2b`；最新校验失败，不能作为正式发布候选。
- 日常 `npm run dev` writer PID 4625、`dist/development` 和 43120 输出守卫被保留；没有覆盖输出、切换日常扩展或停止其他 Chrome。
- 网页为受控本机 HTTPS：`https://localhost:43180/demo-form.html`，沿用规范 demo-form 页面，仅在服务器响应中替换示例文字。使用测试自签名证书并经过 Chrome 证书页面继续；**不是公共网站实测**。未授权 Origin 另用 `https://127.0.0.1:43180`。
- 选区及右键使用有进程/前台保护的 macOS CGEvent；菜单证据含 AXMenuItem 与系统截图。普通按钮使用 Chrome Input 事件，文件输入走真实导入审阅 UI。没有 DOM 伪造右键、没有直接写 Storage 构造成功。安装后的 Storage 只读用于核对版本和载荷摘要。
- 当前实际安装载荷 HTML/CSS/JS 的 SHA 均与正式 1.1.2 JSON 一致；业务 `main.js`、固定 `notes.js` 与 1.1.1 完全相同，能力声明未改变。复制及文件导出读回在 1.1.1 完成，1.1.2 的对应业务字节相同，未声称又完整重测一遍。

全部原始文件保留在本机忽略目录：[本轮证据](</Users/shopme/Documents/workspace/opendesk-browser/artifacts/web-markdown-clipper-r1.7.5-local-20261020-01a15a04>)。测试 Profile、临时构建、证书和密钥不提交；不要公开上传整个 Profile。

**逐项操作与证据**

| 操作 | 状态 | 实际结果 / 证据文件（均在上述目录） |
|---|---|---|
| 原生右键 → 预填 → 保存 → 打开 | PASS | `context-menu-native.png`、`native-context-menu-real.txt`、`saved-current-readback.json`、`opened-note-current.json`；中文全文和 localhost HTTPS 来源一致 |
| 关闭侧栏再打开 | PASS | `reopened-panel-readback.json`，一条完整记录 |
| 完全退出 Chrome 再启动 | PASS | `browser-exit-receipt.json`、`browser-restart-readback.json`；旧 PID 45644 结束，同 Profile 新 PID 49237 读回 |
| 中文搜索 / 编辑并重新打开 | PASS | `search-readback.json`、`edited-note-readback.json` |
| 复制 / pbpaste | PASS（需二次确认） / 单击 UX FAIL | `clipboard-readback.json`，93 UTF-8 字节，精确为“这是一条用于 OpenDesk Browser 真实验收的中文摘录。编辑后仍完整保留。” |
| Markdown 下载、磁盘读回 | PASS（需二次确认与 Save As） | `chrome-downloads-readback.json`、`download-readback.json`，实际文件完整包含指定中文 |
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
| 320px / 200% | NOT_TESTED | 原生缩窄请求后仍 360px；四次缩放快捷键后侧栏 DPR/宽度未变，不能把截图命名当成 200% 证据 |
| 焦点 / ARIA | 局部 PASS；完整键盘 NOT_TESTED | `keyboard-tab-readback.json`：Tab 到“刷新摘录”，2px 焦点轮廓；状态有 role=status、aria-live=polite |
| fresh-main Browser / Native 正式候选 | BLOCKED | 完整构建和产物校验未通过；上述诊断 Host 实测不替代正式候选 |

**实际文件读回**

- Markdown 原始磁盘路径：`/Users/shopme/Downloads/OpenDesk Browser · Browser Test Lab.md`，4394 字节，SHA-256 `3c15dfe5f2b24954cf063ca08dc868c291362a2e6e631016684e2d1e5042ef50`。读回后复制到证据目录 `downloads/`，未以副本代替首次实际路径检查。
- JSON：证据目录 `downloads/web-clipper-notes.json`，477 字节，格式 `opendesk.clipper-notes.backup.v1`，SHA-256 `557c84830b865955634b1c03436ded5c3ed7b7916aae2d5a2e67d5bc912267de`。
- 历史 1.1.0：从 `d7ac64f00010dadf3a0bf974e34cd6a3b526d1e1` 归档源文件及同提交打包器，未改历史源重建包，SHA-256 `15434da7d8d82a0d946a4553c7850c7e0d64518c4010b80e7d747f80b5d99fde`。`historical-provenance.json` 核对归档文件与 Git 原文相同；它是可信历史源码重建包，不冒称历史发布时的原始二进制附件。

**故障、根因、修复与复验**

1. **深色错误文字偏暗：已修复。** 真实输入正文超限后，1.1.1 仍使用浅色错误色 `#b14251`，落在 `#202633` 深色背景，仅 2.717:1。只在原 dark media query 增加 `#ffb1bb`，1.1.2 实际安装后为 8.842:1，light 仍 5.574:1。浏览器 prefers-color-scheme 仿真期间保持 CDP 会话，截图与 computedStyle 同时读取；未声称切换了 macOS 系统主题。对照普通文字 [WCAG 对比度说明](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。
2. **普通导出多一次 Host 确认：未修复，单击 UX FAIL。** 源码诊断：同步 verifiedGesture 采样及可消费导出 intent 的免确认路径仅覆盖既有受审 Cookie 场景；普通 user.export 请求进入 `requestBrowserClick`。工具自身没有可信权限可绕过它。仅把 transient activation 布尔值当授权，会失去“真实点击→一次、精确参数导出”的绑定。缺口已证明，跨工具适用；后续最小平台范围为原 Bridge、Admission 和针对合成事件/延迟/重放/升级撤权的测试，继续使用现有 Host 与一次性 intent。本轮未新建端口协议、Authority 或工具特判，未削弱安全断言。**这项尚未满足本次用户要求。**
3. **最初 `--check-project` 失败：旧正式 JSON 缺末尾 LF。** 发布 1.1.1 原始 SHA `758cdf571f54db420a005e7d96d093fe2a5f84f6f814dc9bdebb3b62ddefa580`；解析后全部字段与同源候选一致，不能解释为业务载荷漂移。没有就此改写已发布 1.1.1。真实 CSS 修复升 1.1.2 后，经原打包器候选、定向门禁、`--promote-from`、`--check-project` 闭环通过。
4. **root build 输出守卫拒绝：保留其他会话 watcher。** 未停止 writer；改用原 build 机制在 Git 归档快照、独立输出守卫 43179 构建。随后仍实际失败于无关 Prompt Shortcuts 的 `src/style.css:178` 私有阴影颜色 `#00000015`，触发 `E_PREVIEW_DESIGN`。未修改别的工具来凑绿色。
5. **旧 production 校验失败：未放宽校验器。** `existing-production-verify.log` 记录 `ui/tool-shell.js` 的 unapproved dynamic constructor reference；因此冻结副本只作诊断 Host。fresh-main 正式验收仍 BLOCKED。
6. **输入自动化问题已与产品问题分开。** 早期 Cmd+A 驱动没有发 selectAll、部分原生点击前台丢失被拒绝、关闭侧栏后网页重排使旧坐标失效，均修正辅助驱动并读取实际结果；没有为这些驱动问题改业务代码或计作成功。

**命令与实际退出码**

所有 root 命令的逐条日志和记录在 `command-logs/results.json`，没有把 runner 自身退出码当全部测试通过。下列完整生产构建在 CSS 修复前运行；本次没有 Host/构建器 JS 变化，阻断输入未变，未反复重建。

| 命令 | exit | 结果 |
|---|---:|---|
| `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project` | 初次 1；1.1.2 为 0 | 见上述 LF 根因和新版同源回执 |
| `shasum -a 256 examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json` | 0 | 当前摘要见下文 |
| `node --test examples/sidebar-tools/web-markdown-clipper/tests/notes.test.mjs examples/sidebar-tools/web-markdown-clipper/tests/ui.test.mjs` | 0 | 初次 25/25；新增边界测试后与打包门禁一起 35/35 |
| `node --test tests/environment/browser-sdk-context-menu-r11.test.mjs tests/environment/browser-sdk-r13.test.mjs tests/environment/markdown-tools-r22.test.mjs` | 1 | 39/45；R22 五项因共享官方资源构建被 Prompt CSS 阻断，一项旧 HTML catalog 断言失配。正文/epoch 集成测试因前置失败仍未执行，不能宣称无关而关闭 |
| `APP_CI_SELECTED=web-markdown-clipper node scripts/app-ci.mjs plan` | 0 | 选择 Clipper，要求 browser/native |
| `node scripts/app-ci.mjs inspect web-markdown-clipper` | 0 | chrome=true，native=true，kind=page |
| `node scripts/app-ci.mjs build web-markdown-clipper` | 1 | 43120 live writer 输出守卫拒绝 |
| `node scripts/app-ci.mjs node web-markdown-clipper` | 1 | 74/85；混合共享构建、R22 集成、旧 catalog、Knowledge Inbox、所有权/回执失败，未改无关模块 |
| `npm run check` | 0 | 源码检查通过 |
| `npm run build`（root） | 1 | writer 输出守卫 |
| `npm run build`（独立快照，43179 guard） | 1 | Prompt Shortcuts CSS 的 E_PREVIEW_DESIGN |
| Clipper candidate `--out artifacts/sidebar-tools/web-markdown-clipper/candidate.opendesk-tool.json` | 0 | validated=true |
| `node --test …/notes.test.mjs …/ui.test.mjs tests/environment/sidebar-tools.test.mjs` | 0 | 新增边界后 35/35 |
| `node --test --test-name-pattern='storage\|ETag\|quota\|canonical exports\|R14 preview' tests/environment/sidebar-tools-host.test.mjs` | 0 | 10/10，包括双面板存储锁、ETag、配额、升级保留数据、精确一次性导出授权 |
| 同一打包器 `--promote-from artifacts/sidebar-tools/web-markdown-clipper/candidate.opendesk-tool.json` | 0 | `promote-112.log`，随后 `check-project-112.log` exit 0 |

Browser/Native 正式 CI 因完整候选前置失败未继续，状态 BLOCKED；实际 Mac 操作按上表逐项记录。远端 [GitHub Actions](https://github.com/shopable-ai/opendesk-browser/actions) 仅作运行入口：本轮未取得绑定最终 main 的 CI PASS 链接，不能把其他 SHA 的 CI 当本轮结果。本机无 `gh`（exit 127）；Connector 对观察到的远程 SHA 返回 statuses=[]，这不证明 Actions 绿色或没有运行。

**本轮改动与正式包**

- `src/style.css`：仅深色错误文字颜色，修复实际对比度缺陷。
- `tool.config.json`、唯一 `web-markdown-clipper.opendesk-tool.json`：不可变版本升 1.1.2；原打包器构建、门禁后晋升，不更换 ID、能力或业务 JS。
- `tests/notes.test.mjs`：按本轮要求补精确字节边界、并发 CAS、Host 配额拒绝测试；模拟 CAS 拒绝返回真实合同的冲突码。
- `README.md`：澄清整个 clips 键值配额，修正唯一正式安装包及候选晋升说明。
- 本记录：保留成功范围、失败、NOT_TESTED 和原始证据位置。

正式可导入包：[web-markdown-clipper.opendesk-tool.json](/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json)，版本 **1.1.2**，41277 字节，SHA-256 **`4e86bde94969ab9691bfaea9c52e47c34ec50059155369145f72c40c6d4c6fda`**。它通过工具级门禁并已真实安装，**不等于整个 Browser 新 production 包正式验收通过**。

**五位独立专家审阅**

评分限于各自审阅到的已验证事实，未将缺失的 fresh-main 或其他原生证据计为通过；后补边界测试没有被用来擅自提高已完成的专家评分。

| 专家 / 独立 agent | 已验证范围评分 | 证据、主要风险与未测范围 |
|---|---:|---|
| 产品 UX、颜色与交互 / Jason `01a15a2a-9b6b-7912-b813-a5549a04ad01` | 84 | 确认 dark 修复、light 保留、三档宽度；二次导出确认仍 FAIL，320/200%/完整键盘 NOT_TESTED |
| Chrome SDK 与原生右键 / Cicero `01a15a2d-6a6f-71e3-bf06-41967b243d57` | 88 | 原生菜单、中文与来源读回、重复消费拒绝、升级恢复证据吻合；fresh-main 及 Chrome 文档替换/撤权竞态 NOT_TESTED |
| 存储可靠性 / Einstein `01a15a2a-9c80-7ef0-872a-6cfcfd4e9eb5` | 88 | 重启、编辑、系统剪贴板、真实文件、删除证据吻合；真实 Chrome 配额/并发/unknown 故障注入 NOT_TESTED；指出的配额文档歧义已修正 |
| 权限、安全与旧版升级 / Bernoulli `01a15a2c-47a0-79b1-8715-2386476fbef1` | 88 | 样本数据、正文授权、右键授权重置与恢复、取消升级有证据；中途失败回滚和 fresh-main 正式安全验收 NOT_TESTED |
| 构建、测试与发布 / Aquinas `01a15a2a-3923-78a2-b0b0-c0b8f90c5cf5` | 85（补证后） | 晋升与同源检查 exit0、35项工具/打包与10项Host测试；集成失败仍未关闭，完整 production 和正式发布 NOT_TESTED |

**尚未关闭的交付阻断**：fresh-main production 构建/校验与 R22 集成证据不闭合；单击复制/下载 UX 不满足；指定 320px、200% 和完整键盘未验证。未发现已测正常保存链丢数据，但不能据此承诺所有故障场景无数据丢失。保留既有安全边界和其他 Agent 的改动，未宣布完整目标完成。
