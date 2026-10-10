# R3.1 93b1fa4a 最终固定版本独立验收附录

结论：**四个已执行的原生 Chrome 场景 PASS；同源开发 / 生产安装包的实际编译字节绑定 PASS。** 本次复用既有有界核验方法，只读下载与检查原件，没有启动 Chrome、新增测试、修改仓库、旧证据或评分。

固定源码：`93b1fa4aae020785b3af50d629312dc755ff502e`。Git tree：`1fedd74d59ba4aef62b72455f3ded56cd0e1e189`。两条 CI 均已独立确认 main、同一源码、attempt 1，run 与 job 均 success。

## 原始证据身份

| 证据 | 原始 CI / job / artifact | 原件大小与文件数 |
| --- | --- | --- |
| R3.1 真实 Chrome | [run 38047731739](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731739) / [job 114200554895](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731739/job/114200554895) / [artifact 11667872680](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731739/artifacts/11667872680) | 187,279 B，43 个原始文件 |
| 开发 / 生产双包 | [run 38047731610](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731610) / [job 114200554482](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731610/job/114200554482) / [artifact 11668107310](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731610/artifacts/11668107310) | 1,962,194 B，6 个原始文件 |

- 原生 ZIP SHA-256：`5a8e0be8c2899e5e726ae93a51cc6b786e3c8e667fd92370ae4e90745d813661`。
- 双包 ZIP SHA-256：`bec82180104be71bdce61fa1014d624f276013764cd54b5270eeb838a3b8c7d3`。

两个独立下载的外层 ZIP 与 GitHub artifact digest / 大小一致。原始成员无重复或不安全路径，CRC 与全部解压字节一致。已有旁证日志原样保留，没有计入 43 个原生文件，也没有用日志推断未执行的原生场景。

## 原生授权与重启检查

**22 个不同 documentId、22 个不同 receiptId**：20 次安装后正常自动运行，Worker 重启后的第 21 次，同 profile 完整浏览器重启后的第 22 次。四个实际 case 全部 PASS。

**permissions.request = 0**：原始 binding 事件流、permission-observations 与 acceptance 一致，51 个检查点全部为 0。4 个 observer 包含 3 段 Worker 和 1 个 Side Panel 文档；退休代次继续累计，重启没有清空旧计数。固定 driver 的 wrapper 只观察并转调原函数。

A / B 的安装身份和 native registration ID 独立；A 持续 active，B 持续 disabled，实际 Chrome registration 中 B 缺席，**B 执行回执为 0**。所有文档快照的完整已记录授权、固定 sourceHash / manifestHash、站点范围和代次与基线一致。两个 fixture 为普通 JavaScript，权限为 page.dom，networkOrigins 为空。

真实 Worker stopped → target absent → running 事件链完整，重启前后 native uniqueId 与 observer 身份不同；全流程共 3 个实际新建的 Worker execution context。只有 Worker 重启时 browser session 不变，旧 20 条回执未重放。

整浏览器 Chrome PID **2244 → 2542**，相同启动参数、profile device / inode **16777229 / 3525679**。旧 21 条回执的全部投影字段和安装授权保持不变。旧 session `5b40b25d-266b-44be-974e-03c46f63aea5`，新 session `472adb59-e658-4b6e-94e8-6178cd81b1ca`；仅第 22 条使用新 session。

两个自有 Chrome 主进程均 exit 0、launcher exit 0，原 profile **一次删除成功**，cleanup PASS、errors / residual 为空。本轮没有出现真实 ENOTEMPTY 重试；16 项清理故障注入 selftest 的通过证据单独保留。

同一次 R3.1 CI 的定向组件 **251 / 251 PASS**，0 fail / skip / cancel / todo；`npm run check` 检查 **271** 个文件，`npm run build:dev` PASS。

## 同源实际编译包绑定

**194 个构建输入与 4 个 driver / 生命周期输入**的长度和 SHA 全部匹配不可变 Git `93b1fa4aae020785b3af50d629312dc755ff502e`。开发、生产及 Mac 原生构建的 sourceInputs 相同、无构建期间漂移。

| 项目 | Development | Production |
| --- | --- | --- |
| 实际编译文件数 | 47 | 32 |
| 安装 ZIP 字节数 | 1,420,360 | 498,414 |
| `sw.js` 字节数 | 327,193 | 327,027 |
| 安装 ZIP SHA-256 | `a189887c37b9142518eba109de453f12d17d5ca9d89458705e1f1824cccf0b20` | `58456ec1f6afcb33736c8c35d7a2dfb5c97568bf992b7df22b081e294a0537d2` |
| packageHash | `598bd11c2729c243f9fff7d48c60c8806f3d5012894ff142295d9ffaddfc97e0` | `0ef0f12c6f9eb91fe841778aa989520833f9228f9d6a5b78669e8b72bb960d4b` |

重新读取两个内层 ZIP 的 **47 + 32 个实际编译文件**，逐文件计算 bytes / SHA，全部与 build report 一致；重算 packageHash 与 build / pack 收据一致；内层 ZIP 的实际长度及整体 SHA 与 pack receipt 一致。全部 79 个实际文件收据存于本附录 JSON 的 `packages.compiledFileReceipts` 中。

Mac 原生运行的完整开发包 report 与独立重算的开发 ZIP report **完全一致**。运行前后实际包字节未变的断言仍在固定 driver 源码中并通过。这次使用当前候选的真实 ZIP，没有沿用 eeb3af02、6d1ab8f、bd76b2d 或本地不同构建回执的哈希。

## 保留的真实验收边界

本套原生测试未执行原生站点撤销 / 授权泡泡 / 主动恢复、实际同范围升级 / 扩权确认、对抗性跨程序调用 / 注入旧回执竞态，以及 Controller / 本地项目原生 20 次循环。observer 附加前的启动调用不在计数窗口内；22 次导航仍使用一个合成 loopback 来源。

**jQuery 依赖升级、源码保留及元数据升级的组件通过，不等于原生 Chrome 升级验收。** 本次四个 native case 继续使用普通 JavaScript fixture，没有真实安装后更新 jQuery 依赖的步骤。

其他工作流不由本报告推断为全部通过；既有失败原件、旁证中 SDK 清理失败及所有未测项保持其原有身份和结果。此附录不更新整体评分，也不以组件数量代替总体完成度。
