# R3.1 eeb3af02 原生证据独立核验

结论：**PASS，限于本轮真实执行的四个原生场景。** 只读核验，没有修改仓库、旧报告、评分或原始 artifact，也未启动浏览器。

- 固定源码：`eeb3af02ca79eb63d6251195f326f977a7ab5b1d`。
- [原始 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996123) / [job 114195532077](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996123/job/114195532077) / [artifact 11667239484](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996123/artifacts/11667239484)。独立读取 GitHub 确认 main、同一 SHA、attempt 1、run/job success。
- 原始 ZIP SHA-256：`e9e58d59c7dc173f72f0a8b353a0d389a561395b36f4a19e6a6bf814aee5b5d8`，与 GitHub digest 相同；**43 个原始文件**的 CRC、解压字节及路径完整性全部通过。额外保存的 CI job 日志不计入原生原件。
- **193 个构建输入**及 **4 个 driver / 生命周期输入**的长度与 SHA 全部匹配该提交不可变 Git 对象。build report 与原生 package report 完全一致；47 个包文件指纹重算得到 `0054113f15c3015829fa31ccdecd1ee01b50d6f1766b5a91e96d2a9d2e8ae5c1`。

## 运行与重启证据

**22 个唯一 documentId、22 个唯一 receiptId**：20 次安装后自动运行，真实 Worker 重启后的第 21 次，以及同 profile 整浏览器重启后的第 22 次。四个原生 case 全部 PASS。

原始 binding 事件、permission-observations 与 acceptance 一致，**permissions.request = 0**；51 个检查点全部为 0。4 个观察器覆盖 3 段 Worker 执行上下文和 1 个 Side Panel 文档，退休代次保留并累计，没有在重启时清空计数。Worker context ledger 有 4 条创建 / 销毁等事件，其中实际创建的 native execution context 为 **3 个，uniqueId 均不同**，不能把事件条数误报为 Worker 数。

所有文档的程序授权、sourceHash / manifestHash、安装身份、站点范围与授权代次保持一致。A 持续 active；B 的独立安装持续 disabled，实际 native registration 不存在，**B 执行回执为 0**。程序仅具 page.dom，networkOrigins 为空。

Worker 重启具有原始 stopped → target absent → running 事件链，新 native uniqueId 与新 observer 身份匹配；仅 Worker 重启时 browserSession 不变，旧 20 条已记录回执未重放。整浏览器重启 PID **24881 → 25197**，profile device / inode **16777227 / 3592551** 保持不变，启动参数相同。旧 21 条回执的全部投影字段和授权不变；旧 session `d917a793-13f1-49bd-b38c-d8b2f698fc87`，新 session `aac5664f-05c4-42db-971b-60ce874d3c08`。只有第 22 条新文档回执使用新 session。

两个 Chrome 主进程均 exit 0，launcher exit 0，原 profile **一次删除成功**，cleanup PASS，errors / residual 为空。本轮没有观察到真实 ENOTEMPTY 重试；16 项故障注入 selftest 单独通过，不混为真实 Chrome 重试证据。

同一原生 CI 的定向组件 **248 / 248 PASS**、0 skip / cancel / todo；`npm run check` 检查 **269** 个源码 / 测试 / 构建文件；`npm run build:dev` PASS。

## 未扩大结论的部分

原生站点撤销 / 授权泡泡 / 主动恢复、真实同范围升级 / 扩权确认、对抗性跨程序调用 / 注入旧回执竞态、Controller / 本地项目原生 20 次循环仍非本套原生场景；observer 附加前的启动窗口不在请求计数内。22 次导航仍为一个合成 loopback 来源。

此 ZIP 提供完整构建输入、包文件指纹和实际运行证据，**没有包括 47 个编译文件本体**。本次独立重算的是包指纹清单及不可变源字节；固定 driver 的实际包文件前后哈希断言通过。若要声称独立读取本版本的编译包字节，还须关联本版本的实际双包 ZIP，不能沿用旧 6d1ab8f / bd76b2d 的包哈希。

Controller HTML / R13 的并行 lane 失败保持原判，不在本报告中改判为通过；本报告不更新总体评分。
