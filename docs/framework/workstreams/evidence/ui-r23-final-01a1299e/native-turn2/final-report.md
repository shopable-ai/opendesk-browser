# R23 Final 本机续验结论

结论：**PARTIAL_ACCEPTANCE，整体未 PASS**。本轮真实缺陷已修复并验证；根目录旧构建、部分专项未测以及原 Linux CI 失败的同环境复核仍限制正式关闭。

## 身份与构建

- 完整候选 SHA：`e83738816d108506e13f28bd3d4e3be48ac30e4e`，来自 main 的提交内容；生产/开发各 258 项构建输入与该 SHA 完全一致，构建期间零输入漂移。
- 当前 main 候选实际 Chrome 扩展 ID：`fahogihogbphclgicdghfelfikllgapk`。Chrome155.0.8059.39，专属 CFT PID74794/Profile；同一自有 Profile 内按顺序停用旧候选，未输入或修改其他 Agent 的 Profile。
- 实际加载生产目录：`/Users/shopme/Documents/workspace/opendesk-browser/.runtime/ui-r23-final-01a1299e/candidate-main-current/dist/production`。采用专属验证副本构建，保护共享根 dist。
- production packageHash：`4f0de41aca0a1e7c80406e4bab0619d464898b7f5addaf933d813048aef28d06`；development：`7232e5cf761483c2c75194453c299274e9188b7e60b2c9b50eb8e447d5c2ef7d`。
- 生产：50 文件，总 1407383 bytes，JS 1149695 bytes，CSS 89707 bytes。开发：69 文件，总 4883822 bytes，JS 1154148 bytes，CSS 89707 bytes（总量含 sourcemap）。
- sw.js：320970 / 327680 bytes，余 6710；未改任何预算。
- **根目录也实际只读加载**：ID `efhcmggbgamacpfhhmooelgdkepdcghh`，路径 `/Users/shopme/Documents/workspace/opendesk-browser/dist/production`；分类 OLD_DIST，Workspace CSS 28745 bytes / SHA dec0b1e8…，不能替代当前 main 候选。根生产40/开发57文件均原字节保留。

| 关键文件 | 字节数 |
|---|---:|

| sw.js | 320970 |
| ui/tool-shell.js | 322964 |
| ui/tool-shell.css | 48924 |
| native-agent/settings.js | 88932 |
| native-agent/workspace.css | 28958 |
| native-agent/settings.css | 2166 |
| ui/design-tokens.css | 812 |
| ui/design-system.css | 3306 |

npm ci 在本轮专属候选上成功；后续相同锁文件复用本任务的物理依赖副本，无跨根依赖软链接。当前 main check（368文件）、build、build:dev、verify 全部成功，定向测试 **38/38**。原根 dist 9 PASS/2 FAIL、观察器失败及中间失败日志均保留，不上调为 PASS。

## 真实 Chrome 和 Native

- R23 五个 Side Panel 页签、独立工具、Settings、Workspace 布局：80/80；320/360/400/480/600 CSS px × 实际 Chrome100%/200%。CSS viewport 使用 CDP Emulation，缩放使用 tabs.setZoom/getZoom；未冒充物理拖拽分割线。
- 当前 main 新 R24 知识工具：独立页刷新10/10，iframe 使用 DOM owner frameId 与实际 target 绑定。原 R23外壳、Native JS/CSS、knowledge-host、transport 与已测版本逐字节相同，按测试指南复用未受影响证据。
- 打开真实文件、0字节文件、13323字节长文和实际编辑区滚轮（scrollTop 0→500）通过。已有 roving tabs/AX/键盘证据保留；真实 Native 刷新、Settings启停、Save与冲突后的焦点恢复通过。
- 使用本任务新增子目录 `/private/tmp/opendesk-r22-acceptance-01a1290f/files/ui-r23-final-01a1299e/` 和独立 CLI Named Native 授权；没有复制原 R22 credential 或改原 grant store。
- 草稿编辑不写盘。当前 main 显式键盘 Save：一条完整真实 files.write、一条唯一 Native ack，47 bytes，磁盘及 Native读回 SHA `0047010c634c512515ff7a0d1453ad3938189829abb71f25ce9c8e906eba7169`，焦点回到编辑区。回执：`main-current-chrome/current-main-save-receipt.json`。
- 外部实际磁盘改动：真实 E_FILES_CONFLICT/NOT_DISPATCHED，外部版本和草稿都保留；断联/重连保留草稿并封锁旧会话；正式 CLI 降级/撤权拒写，无盲目重放。最新撤权修复：原 Save 可用→E_FILES_SESSION→立即禁用 Save、保留草稿、磁盘不变，零 files.write；回执 `native-final-chrome/revoke-fixed-receipt.json`。
- 所有 Native 请求/响应来自实际 Native Port；条件恒 false 的 CDP logpoint 只记录原包，不暂停、替换响应或伪造 ack。焦点时序 logpoint 未命中，保持校准失败，不作为 Chrome 内部原因证据。

## 修复与 Git

- `698409af`：独立知识工具 TAB 用 runtime.getContexts 校验唯一真实 document，修复 Chrome155 getFrame=null 的误拒绝；源测试正负分支和真实刷新通过。
- `b4094708`：异步控件禁用后的焦点恢复，含用户主动移焦/Tab/点击/失焦/隐藏取消与实际可见性保护；由串行整合者 thinkido 提交，本轮实际复测通过。
- `388b2535`：已确认失效的原目录授权立即撤销旧可操作缓存；在相同授权身份且未关闭时失效，不误删更新后的不同授权；由 thinkido 串行整合，组件和真实撤权复测通过。
- `e62014ef`：先前本轮证据归档。本次仅追加自己的新证据和 R23 工作流；不创建分支、worktree、PR，不推送/发布。

## :199 单独核查

原 workflow 负责人/提交 d56c8427（shopable-ai）及整合证据已核对；本轮最新 R24 产品提交181efc91与 Native观察修正9896a2c2来自同一工作流 owner。原组件83/83、候选101/101成功证据的原始哈希已复核并保留。原名为“Workspace import rereads durable session under the uninstall lock, and retains failed handoffs”的测试，本机当前 main 与完整候选均通过（插入回归后行号已变化）。**未在原 Linux CI 环境重跑，不声称原 CI 失败已修复**；未争用 R24负责人的 Profile 或重复修改其实现。

## 六专项

| 专项 | 实测评分 |
|---|---:|

| 视觉一致性 | 95 |
| 交互与可访问性 | 95 |
| 组件架构与可维护性 | 96 |
| 性能与产物体积 | NOT_SCORED |
| MV3安全与生命周期 | NOT_SCORED |
| 功能回归与证据完整性 | NOT_SCORED |

评分为专家限定范围评估，不是产品完成百分比。具体依据和缺口见 `scores-final.json`。性能未测首屏/内存/长期事件泄漏；本候选未做完整挂起恢复与在途未知写入故障验收；屏幕阅读器、全部窄屏键盘组合及全部 R24编辑状态未测。保留这些缺口，不为凑95分虚构结论。

## 保留与清理

根 dist、原 R22授权文件及其他 Agent 的未提交文件保持原字节；只对本任务 CFT/授权/Named Native实例操作。CFT已正常关闭，launcher清理自有 Profile；N3–N6官方 cleanup通过。N2因旧Profile先被launcher删除而CLI无法清理，确认无socket/Profile后仅将本任务实例移入私有ignored隔离备份，退出正式安装目录；未删除其他 Native host。原始失败、截图、Native wire、构建 receipt和全部输入绑定保留。

本轮早期有一次根目录 npm ci 误执行，已在上轮 `npm-ci-root-incident.json` 披露；锁文件与根dist未改，但无法追证对其他 Agent 当时依赖读取的影响。后续全部构建在独立副本执行。
