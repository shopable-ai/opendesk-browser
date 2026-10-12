# React Direct 标准 HTTPS URL import · 2026-10-12

## 目标和源码输入

用户确认应该复用已实现的 `import ... from 'https://.../module.js'`，并要求方案可行时直接修改现有示例及给出续接提示词。

读取基线：`main@3646789508843d45bad7fe0321adc857df6b68c5`。原 `remote-esm-page/src/add.js` 已消费 jsDelivr ESM；本轮不恢复 @require 面板，不改变下载器、框架、世界、包类型或扩展权限。

已将 `page-ui-toc-react-direct/src/main.js` 改成直接声明 HTTPS URL，并把真实导入的 D3 max 传入统计模型。原 TOC UI 和生命周期未改；package.json 保持 blob `6c0e69ecf420b3cee12c1a3ba359918697934faf`。旧适配器保留并对齐相同 URL，但不再是主入口。

## 依赖来源

源码为官方 `d3/d3-array@v3.2.4/src/max.js`，经 GitHub 连接器读取；Git blob `ce287368eb4402d359f18ec1c6c81dde0c774cc5`，UTF-8 502 bytes，SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`。许可证原文一同保留。

采用对应 `raw.githubusercontent.com` HTTPS URL 和已有 remote-lock.v1 合同随项目保存真实原始字节，不声称本轮运行了原网络锁定 CLI。未访问成功 jsDelivr，不生成伪 CDN 下载证据，不将上游 API 读取冒充直连 HTTP 测试。哈希固定和缓存不代表来源安全或新的权限许可。

## 本地源码快照验证（提交前记录，保留原等级）

验证环境是 Linux Node v22.16.0 的源码快照，不是用户 Mac 工作区。GitHub/npm 域名 DNS 不可达，无法克隆完整仓库或安装根工具链；只通过 GitHub 连接器读写远端。没有占用 Mac Chrome、Native、profile、端口、dist 或数据库。

- `node --check .../src/main.js`：PASS。
- `node --check .../tests/environment/page-ui-toc-react-direct.test.mjs`：PASS（仅语法）。
- `node --test .../src/heading-stats.test.mjs`：7/7 PASS，原始 [TAP](evidence/react-url-import-20261012/model.tap)。覆盖模型、直接 URL 声明/实际调用、官方字节和许可证、真实缓存模块离线计算及原配置不变。
- 首次模型测试为 6/7：测试正则将源码注释中的 import() 说明误判为执行表达式。修正为排除整行注释后再检查；没有放宽生产校验。初次完整日志保留在本轮本地验证目录，不冒充最终 PASS。
- 完整 builder/JSON 离线及失败关闭回归：提交前本地未执行，随后同一源码候选的 CI 已执行并通过，见下一节。
- 原 TOC 扫描模型没有业务变更，本地未重复执行；现有 CI 组合仍自动运行了它，不将其计作新功能覆盖。

测试过的源码 Git blob：main.js `d8e266377be9d1bc344dba93f90e95a7ce630b71`；heading-stats.js `8e3c18d69e0b14f370c8b61cfb5d6732b51722c9`；heading-stats.test.mjs `c9cb6ea3577be308cc85fedc2ce42f8c0de7b635`；兼容适配器 `a6188ce1cdd59943c653e203b88e51a82a0173ba`；builder 测试文件 blob `3d320560abc1413014b8aba731fc5303a5218cb4`。

## 提交后 CI 核对：真实 builder 与 JSON 已通过

实际合入 `main` 的功能提交：`7fcdb8b15a18d7cf711bc6ba734ed052d3dabcd1`。失败的早期 CAS 没有移动 main；最终提交保留了同期 SDK 文档变更。

核对的 [OpenDesk multi-file source contract 工作流](https://github.com/shopable-ai/opendesk-browser/actions/runs/38237319537) 与 [source-check 原始 job 日志](https://github.com/shopable-ai/opendesk-browser/actions/runs/38237319537/job/114771079658) 绑定该精确 SHA。job 于 2026-10-12T10:36:50Z 完成，结论 `success`；使用 Ubuntu、Node 22.23.3 运行源码/构建组，随后使用 Node 26.3.1 运行原 L2 集成组。

已读取原始日志而非只看绿色状态：

- 源码/构建组合 169/169 PASS，包含本轮 `page-ui-toc-react-direct.test.mjs` 的 5 项（日志第 39–43 个测试）：直接 HTTPS ESM + 固定 React、真实缓存确定性构建与原 JSON 导出、缺锁不下载及显式测试锁定、缓存丢失/篡改拒绝、URL 改变需要新锁。
- 模型组合 13/13 PASS，其中本轮 heading-stats 7 项、原 TOC 模型 6 项。独立本地 7/7 与这次 CI 结果属于不同运行，不能相加作为新增用例数量。
- `npm run check` PASS，日志显示检查 533 个 source/test/build 文件及原严格 CSP/固定入口合同。
- 原 L2 示例/完整 Native 报文/OS 拒绝联网 Mock 构建组合 10/10 PASS；真实固定 npm 示例 1/1 PASS。这些是其各自已有合同，不是本 TOC 的 Mac Native 运行证据。
- `live-https-esm-smoke` 为 `skipped`，不能宣称实际外网下载通过。

同候选的另一项 Sidebar R1 P0 工作流 `38237319659` 的 `draft-and-saved-regression` job `114771080041` 在 “Test draft/saved transport, editor, controller authority and run recovery” 步骤失败；本轮未定位该项根因，不把它假定成无关或宣称全仓 CI 全绿。本例对应的 source-check 和上述五项 builder 测试确实通过。

**仍为 NOT_TESTED：** 本例真实 CDN 直连、Mac Native 完整运行、Chrome 可见目录/统计和 Run/Stop、JSON 安装。ECharts 尚未实现；本次 D3 计算模块不是 ECharts 完成证明。README 中“完整 builder 未取得本轮 PASS”是提交前记录，以本节新增精确 CI 回执为准，浏览器验收限制不变。

## 后续

按 [续接 GOAL](../prompts/goal-react-url-import-completion.zh-CN.md) 先复用本节同输入的 builder PASS、补真实 Chrome 验收，再做实际 ECharts ESM URL、依赖图/体积和生命周期验证；另行补齐浏览器仅源码入口的新依赖准备。不要把用户退回油猴式声明，也不要把本地项目成功等同于全部入口已支持。
