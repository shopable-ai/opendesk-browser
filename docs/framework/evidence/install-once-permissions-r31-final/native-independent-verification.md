# R3.1 原生 Chrome 独立核验

结论：**PASS，限于已执行的原生验收范围。** 只读核验，不启动浏览器、不改仓库或原始 artifact。

- 源码：`992f11732657171d9691d99a6b114106c0b7782f`；GitHub run `38042717294`、job `114186007520` 均为 main 上 success，attempt 1。
- 原始 ZIP：40 个原始证据文件（下载的 ZIP 与额外 CI 日志另计），CRC、全部解压字节及 GitHub SHA-256 均一致：`e3eba2fee811ffd8aadc0b7cd9e5c55146270e7e9df6ce81360614fc3d24b47d`。
- **22 个独立文档，不是 23 个**：先 20 次自动运行，Worker 重启后第 21 次，完整浏览器重启后第 22 次；4 个验收场景通过，全部原始请求事件及累计 observer 计数为 0。
- 两个独立安装身份持续保留；A 的固定源码、manifest、规则和授权各代不变，B 持续 disabled 且没有执行回执。没有通过网页 SDK 替代程序授权。
- 整浏览器重启后旧 21 条回执的全部留存验收字段逐字段保持不变；仅第 22 条使用新会话。旧会话 `a23a83e8-ee83-42ca-8b46-c51e5339fa05`，新会话 `3622a1ac-7462-4475-b363-872f64e47dc4`。
- 3 个不同的原生 Worker execution-context uniqueId；实际 stopped、目标缺席、running 事件连贯。4 个 observer 跨代累计，旧代退休而未清空。
- 两个真实 Chrome 155 进程 `4393 → 4666` 使用相同 profile inode、参数和构建目录；均 exit 0，profile 已删除，cleanup PASS。
- 4 个 driver/生命周期输入 hash、179 个完整构建输入逐字节匹配该 Git 提交。构建报告与原生运行报告的 45 个包文件指纹完全一致；独立重算 packageHash 为 `f7791357fce94f7d96870eb4a6c74d805de35433642cc00baf5fcd52429e6aa4`。最终 driver 的包字节不变检查仍在源码中。
- 同一次 CI 的 233 项定向组件、`npm run check`、`npm run build:dev` 均通过。

[原始 CI job](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294/job/114186007520) · [原始 artifact](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294/artifacts/11665844192)

## 证据边界

原生撤销/恢复泡泡、同范围升级/扩权确认、对抗性跨程序调用/旧回执竞态、Controller/本地项目原生 20 次循环，以及 observer 附加前的启动调用仍未由本套原生验收覆盖；22 次导航只使用一个合成来源。组件测试证据应与这些原生缺口分别表述。

原始 artifact 提供完整构建源码快照与包文件指纹，未打包 45 个编译产物；因此这里独立重算的是包指纹列表及 Git 源字节，没有声称重新读取 CI 的编译产物字节。运行时前后对实际包字节的校验由已核对源码的 driver 执行。

`789fa3a → 992f117` 无生产代码变化，差异仅原生 API 就绪等待与两份文档；以前失败的 artifact 未被修改或改判为通过。
