# Web Markdown Clipper R1.7.5-LOCAL · Mac 验收记录

2026-10-21。**真实开发环境核心流程已通过，完整正式验收未完成；不宣称 UX 95+ 或正式发布通过。**

1. 原生右键保存：**PASS（下述独立 CFT / 开发 Host）**。实际选中指定中文，Chrome 原生菜单打开当前安装工具，一次保存后打开核对全文和 HTTPS 来源。
2. 退出重启：**PASS（正常完整退出）**。旧进程消失后，同 Profile 新进程读回两条完整记录，已删除记录没有恢复。崩溃、强杀和断电 NOT_TESTED。
3. 旧版升级：**PASS（可信历史 1.1.0 → 1.1.3 样本）**。真实安装审阅 UI 原位更新，同 ID，旧编辑内容和正文授权保留；旧右键授权记录仍存在，但 version/hash 绑定失效，用户重新启用后可继续剪藏。提交前取消不破坏旧数据；提交中途失败恢复 NOT_TESTED。
4. 搜索、编辑、复制、Markdown 下载和 JSON 备份：**PASS（实际读回）**。本轮解决鲜读备份重复确认，真实单击直接下载；未删除鲜读或改为陈旧缓存。
5. UI：修复旧版深色错误文字对比度；保留 HTML/CSS/JS 产品和布局。浅深、360/400/440px、真实 200% 下 320 CSS px 已有证据；原生 Return 编辑保存、删除、下载新增通过。全控件对比度、完整纯键盘和屏幕阅读器 NOT_TESTED。

## 环境、版本与证据身份

- 仅在 main 修改、提交和推送；起点 cd7d532cf76e8360dd0e31a1ba3c1845f8eae92d。本次功能提交 606a0785e（鲜读备份）和 33b2f6b1a（真实生产来源边界故障）。最终 main SHA 见 Git 与交付答复，不将本文件自身提交 SHA 写入自身。
- Mac Google Chrome for Testing 149.0.7827.55，独立 prepared-profile；未使用个人 Profile。扩展 ID nfjgimdnhomfgogmbmpommlhlfgoblal。
- 本轮 1.1.3 核心复验使用**持续开发 Host**，路径 artifacts/web-markdown-clipper-r1.7.5-local-20261020-01a15a04/source-prepared/dist/development，页面真实显示开发服务连接。初始 revision a11293ef2063；最终操作 revision 536e758084a6，见 prepared-113-final-host.json 和 prepared-isolated-dev.log。完整 revision 保存在该输出的 development-update.json。
- 快照为上述起点加 prepared-snapshot-overlays.json 列出的输入，包括其他 Agent 未提交的 Prompt CSS 前提。**不是纯 committed-main 的 production 证明**。当前正式安装载荷 HTML/CSS/JS 与 1.1.3 JSON 逐项 SHA 一致，见 prepared-113-formal-installed-match.json。
- 页面为 https://localhost:43180/demo-form.html，使用规范 demo-form 的服务器响应，仅替换示例中文；经过真实 Chrome 自签名证书页面。公共 HTTPS 网站 NOT_TESTED。
- 选区和右键通过 macOS CGEvent / Accessibility 真鼠标和系统菜单；普通控件走 Chrome Input 或原生键盘，包通过真实文件导入与审阅 UI。未伪造 DOM 右键，未直接写 Storage 构造结果。Storage 只读用于身份和逐字比对。
- 旧诊断静态 Host 的 1.1.1/1.1.2、Ticket 和未授权负例属于历史证据，不能替代新 production；旧记录保留在 Git 历史和本机证据中。
- 保护其他 Agent 的 15 个文件及根 dist/development。自己的隔离 watcher PID 70562 已正常停止；自己的 CFT 已正常关闭。根 watcher 先前只读观察已不在，本轮未停止或重启他人服务。

原始证据根目录：
/Users/shopme/Documents/workspace/opendesk-browser/artifacts/web-markdown-clipper-r1.7.5-local-20261020-01a15a04

Profile、证书密钥和构建快照不提交，不应整目录公开上传。下列文件均位于该根目录，命令日志位于 command-logs/。

## 实际操作结果

| 用户操作 / 保护 | 状态 | 读回证据与边界 |
|---|---|---|
| 原生选区 → 右键 → 预填 → 一次保存 → 打开 | PASS | prepared-113-verified-selection.json、prepared-113-verified-menu.txt、prepared-113-verified-prefill.json、prepared-113-verified-save-ui.json、prepared-113-exact-note-open.json；指定中文和来源逐字一致 |
| 关闭侧栏再开 | PASS | 旧版 reopened-panel-readback.json；新版本重启后真实菜单打开 Side Panel 和工具，prepared-113-restart-ui.json |
| 完全退出再启动 | PASS | prepared-113-exit-restart-receipt.json：Browser.close 后 PID 70676 消失，再以同 Profile 启动 PID 75614；prepared-113-before-restart-storage.json 与 prepared-113-restart-storage.json 一致 |
| 中文搜索、编辑、保存、再次打开 | PASS | prepared-113-search.json、prepared-keyboard-edit.json；正文完整，实际原生 Return 保存。文字录入采用 Chrome Input，不称完整纯键盘旅程 |
| 复制与 pbpaste | PASS | prepared-113-pbpaste.txt，93 UTF-8 字节，与编辑后的指定中文逐字一致 |
| 单击 Markdown 下载与磁盘读回 | PASS | prepared-keyboard-download.json、prepared-113-md-readback.json；128 字节，含中文和 HTTPS 来源，无额外 Host 审阅或 SaveAs |
| 单击鲜读 JSON 备份、磁盘解析 | PASS | prepared-single-click-backup-readback.json、prepared-113-final-backup-readback.json；最终 860 字节、两条编辑后完整记录，无额外审阅或 SaveAs；没有覆盖 Chrome 默认下载行为 |
| 删除及重启后仍删除 | PASS | prepared-keyboard-delete.json、prepared-113-restart-storage.json；误选测试记录未恢复 |
| 重复同一摘录不重复创建 | PASS（历史 1.1.2） / NODE PASS | duplicate-save-readback.json；本轮未伪称重复执行全部历史负例 |
| Ticket 一次性消费 | PASS（历史真实 SDK 负例） | ticket-second-consume-readback.json，第二次 E_LAUNCH_EXPIRED |
| 未授权 Origin 正文读取 | PASS（历史 1.1.2） | unauthorized-origin-112-readback.json，正文长度 0；当前定向 SDK 门禁通过 |
| Origin/documentId 替换、撤权、未知副作用 | NODE PASS / 新 Chrome 负例 NOT_TESTED | SDK/Bridge 定向门禁；不将模拟异常提升为原生通过 |
| 正文 2048 UTF-8、整键值 8192 字节、CAS、配额不足和未知写入 | NODE PASS / 原生故障注入 NOT_TESTED | notes.test.mjs 与 prepared-backup-security-fixed-gate.log；未知结果阻止继续修改，需重新读取核对 |
| 1.1.0 原位升级、正文授权、右键重新启用 | PASS | prepared-110-before-storage.json、prepared-110-to113-review.json、prepared-113-after-storage.json、prepared-113-before-context-enable.txt、prepared-113-context-reenabled.json |
| 取消升级保留旧版本与数据 | PASS | prepared-110-to113-cancel-review.json、prepared-upgrade-cancel-readback.json |
| 升级提交中途失败/进程中断恢复 | NOT_TESTED | 取消审阅不能证明事务中途恢复 |
| 浅深主题、360/400/440px、真实 200% / 320 CSS px | PASS（已有同 HTML/CSS 证据） | native-320-200-readback.json、native-320-200-*、light-error-112.json、dark-error-112.json；1.1.3 HTML/CSS 哈希未变 |
| 最新 production Browser/Native 验收 | BLOCKED / NOT_TESTED | 有效 production 候选尚未生成；没有拿旧包、部分输出或开发包冒充 |

历史 1.1.0 来自 d7ac64f00010dadf3a0bf974e34cd6a3b526d1e1，以该历史源码及历史打包器重建可信包，SHA-256 15434da7d8d82a0d946a4553c7850c7e0d64518c4010b80e7d747f80b5d99fde；不是现存历史发行二进制。旧版真实保存并编辑后，通过同一安装器升级，未卸载重装。

## 文件读回

| 实际磁盘文件 | 字节 | SHA-256 |
|---|---:|---|
| /Users/shopme/Downloads/localhost (1).md | 128 | 2cfd70cf12ee7e6e9c48e47d7b612d68ccd3919c7e4bfb19a39b0da523b87264 |
| /Users/shopme/Downloads/web-clipper-notes (1).json | 860 | cc7a601590299a524ba3c1f2060d4c716c3b3ffa5745bfea7142f2ada0c96762 |

副本为 downloads-prepared/selection.md 与 final-backup.json。最终 JSON 保留旧版编辑正文“旧版编辑内容必须在升级后保留。”及新版编辑正文“键盘编辑后仍完整。”。以文件解析与存储比对判定，没有只看“成功”提示。

## 故障、修复与复验

- **深色错误文字不清晰**：旧色对比度 2.717:1，已在前一提交的 1.1.2 最小改色为 8.842:1；浅色保持 5.574:1。无 UI 重设计。
- **普通复制/下载重复 Host 确认**：前一提交 cd7d532 修复同步原生单次点击通道，保留私有 port、Host intent、Cookie 和撤权校验。真实读回通过。
- **鲜读备份仍重复确认**：await reload(true) 离开同步点击派发。606a0785e 新增本地 downloads.prepareText(factory)，在原生点击同步消费单次机会，鲜读后仍使用唯一 browser.downloads.text / Host；8 秒、身份和连接检查紧邻发送，失败不回退重放。1.1.3 真实单击落盘及最新内容核对通过。
- **独立安全复核发现发送前时序缺口**：可修改的 timeout 查询可能让最终期限检查过早。已将复核放在发送初始化之后、私有 portPost 前；deadline/pagehide/throw 负例通过，零发送。117 项组合门禁通过。
- **生产 SW 静态导入 Prompt 业务违反来源锁**：33b2f6b1a 将站点策略判定留在原可信 Page 适配器，Host 用真实 tab/frame/document 定向探测，在记录队列中复核授权、导航和 consent。仅更新被修改 Page 的固定 blob pin；未放宽 SW 白名单。77 项及真实 Page 适配器联动通过，独立 Curie CLEAR。原生统计路径 NOT_TESTED。
- **最新生产仍失败**：共享 ui/tool-shell.js 为 1,074,242 字节，超过原 1,048,576 上限 25,666 字节。只读独立复核未找到足量可安全删除的闲置依赖；不删除现有功能、不调整预算、不开展共享 UI 重构。生产候选和后续正式 Browser/Native 验收仍阻断。
- **观察器错误已区分**：平滑滚动导致早期鼠标坐标选到 OpenDesk，工具准确保存实际选区；改为稳定坐标并逐字校验选区后重跑真实中文链。Cmd+Q 未退出不计成功；后续 Browser.close 真实退出且确认旧 PID 消失后才重启。升级旧授权记录仍存在，不用“记录删除”作为错误通过标准。
- 共享 Prompt tooltip 旧断言 59px/实际64px 失败属于未改现有 UI 的基线问题；未通过改颜色、放宽断言或删除测试掩盖。analytics 相关新增检查单独定向通过。

## 构建、测试与发布

实际命令、cwd、退出码及历次失败保存在 command-logs/results.json；修复后的结果不能覆盖早期失败。

| 命令 | 最新实际退出码 / 结果 | 日志 |
|---|---|---|
| node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project | 0，同源 | check-project-113.log |
| shasum -a 256 examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json | 0，见下方摘要 | 正式文件再次实际读取 |
| node --test examples/sidebar-tools/web-markdown-clipper/tests/notes.test.mjs examples/sidebar-tools/web-markdown-clipper/tests/ui.test.mjs | 0，33/33 | prepared-backup-tool-node.log |
| node --test tests/environment/browser-sdk-context-menu-r11.test.mjs tests/environment/browser-sdk-r13.test.mjs tests/environment/markdown-tools-r22.test.mjs | 0，46/46 | clipper-113-required-sdk-tests.log |
| 工具 + Bridge + R13 + 包组合定向门禁 | 0，117/117 | prepared-backup-security-fixed-gate.log，完整命令在 results.json |
| analytics/source 定向门禁 | 0，77/77 | final-analytics-source-gate-corrected.log |
| node --test --test-name-pattern="Host probes real custom-site adapter" tests/environment/prompt-shortcuts-r14-page.test.mjs | 0，1/1 | final-analytics-page-integration.log |
| APP_CI_SELECTED=web-markdown-clipper node scripts/app-ci.mjs plan | 0 | clipper-113-app-plan.log |
| node scripts/app-ci.mjs inspect web-markdown-clipper | 0 | clipper-113-app-inspect.log |
| node scripts/app-ci.mjs build web-markdown-clipper | 1，历次共享构建阻断，无有效 candidate receipt | isolated-app-build-local-deps.log；本轮未重复相同输入的完整构建 |
| node scripts/app-ci.mjs node web-markdown-clipper | **1**，113 个断言通过，之后缺 candidate-receipt.json | clipper-113-app-node.log，整条命令不能报 PASS |
| npm run check | 0，954 文件 | prepared-final-check.log |
| npm run build（独立冻结快照，守卫43179） | **1**，tool-shell 体积超限 | prepared-production-build.log；没有覆盖根输出 |
| app-ci Browser / Native（新最终 production） | BLOCKED / NOT_TESTED | 依赖有效 production 候选；旧 R22/真实开发操作不替代 |

没有最终提交绑定的 GitHub Actions PASS 链接。提交页面可查 GitHub 的 Checks / Actions；不得用 combined status 空列表或仅 PR 过滤的 workflow 查询宣称所有 CI 不存在或通过。

唯一正式可导入工具包：examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json

**版本 1.1.3，41607 字节，SHA-256 13aab304b7688a4ed16a479a2b1823f2fca9caffcda1ce9c9617f44ec3178808。**

通过原打包器候选 → 定向门禁 → 同源原子晋升 → check-project，未覆盖已发布 1.1.1/1.1.2 内容。工具包可手动安装候选通过，不代表整个 Browser production 发布通过。

## 修改归属与独立评估

本次鲜读备份提交涉及 Clipper notes.js、notes.test.mjs、tool.config.json、README、唯一正式 JSON；通用最小缺口涉及 Bridge、Browser SDK façade、两份定向测试与 SDK 文档。生产来源故障修复涉及 analytics 三文件、原 Prompt trusted/page、provenance 精确 pin 和四份定向测试。完整文件清单见两个提交；其他 Agent 的 15 个脏文件未暂存或覆盖，保护摘要在 protected-parallel-before-113-commit.json。

本轮独立专家仅对核对过的范围评分，不以目标分数替代未验证事实。原始意见保留于 expert-113-*.md。删除撤销为 UX 专家建议，当前用户要求单击直接操作、保留现有产品，本轮没有为凑分新增弹窗或撤销体系。

| 专家维度 | 已验证范围评分 | 风险 / 未测 |
|---|---:|---|
| 产品 UX / Archimedes | 94 | 单击鲜读备份、颜色与已证实宽度、原生 Return 交互；全控件对比度、完整纯键盘和屏幕阅读器 NOT_TESTED |
| Chrome SDK / Carver | 94 | 单站点原生链与单次下载；新版跨站 iframe、导航/撤权并发及最终 production NOT_TESTED |
| 存储可靠性 / Banach | 94 | 正常重启、升级、文件读回；真实配额、冲突、回执丢失和磁盘灾难 NOT_TESTED |
| 权限与旧版升级 / Laplace | 94 | 同 ID 保留及右键重新启用；中途失败恢复和最终 production NOT_TESTED |
| 构建与发布 / Kuhn | 82 | 最新生产超限、candidate receipt 缺失、最终 CI 未验证，发布 BLOCK |

**未关闭的正式交付阻断：共享 production 工具宿主超预算；纯 committed-main 还缺其他 owner 的 Prompt CSS 前提。** 没有发现已测试正常剪藏链的数据丢失，但最终 production、升级提交中途失败和全部 UX 维度尚未验证，不能宣布本阶段完成。
