# React Direct 标准 HTTPS URL import · 2026-10-12

## 目标和源码输入

用户确认应该复用已实现的 `import ... from 'https://.../module.js'`，并要求方案可行时直接修改现有示例及给出续接提示词。

读取基线：`main@3646789508843d45bad7fe0321adc857df6b68c5`。原 `remote-esm-page/src/add.js` 已消费 jsDelivr ESM；本轮不恢复 @require 面板，不改变下载器、框架、世界、包类型或扩展权限。

已将 `page-ui-toc-react-direct/src/main.js` 改成直接声明 HTTPS URL，并把真实导入的 D3 max 传入统计模型。原 TOC UI 和生命周期未改；package.json 保持 blob `6c0e69ecf420b3cee12c1a3ba359918697934faf`。旧适配器保留并对齐相同 URL，但不再是主入口。

## 依赖来源

源码为官方 `d3/d3-array@v3.2.4/src/max.js`，经 GitHub 连接器读取；Git blob `ce287368eb4402d359f18ec1c6c81dde0c774cc5`，UTF-8 502 bytes，SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`。许可证原文一同保留。

采用对应 `raw.githubusercontent.com` HTTPS URL 和已有 remote-lock.v1 合同随项目保存真实原始字节，不声称本轮运行了原网络锁定 CLI。未访问成功 jsDelivr，不生成伪 CDN 下载证据，不将上游 API 读取冒充直连 HTTP 测试。哈希固定和缓存不代表来源安全或新的权限许可。

## 实际验证

验证环境是 Linux Node v22.16.0 的源码快照，不是用户 Mac 工作区。GitHub/npm 域名 DNS 不可达，无法克隆完整仓库或安装根工具链；只通过 GitHub 连接器读写远端。没有占用 Mac Chrome、Native、profile、端口、dist 或数据库。

- `node --check .../src/main.js`：PASS。
- `node --check .../tests/environment/page-ui-toc-react-direct.test.mjs`：PASS（仅语法）。
- `node --test .../src/heading-stats.test.mjs`：7/7 PASS，原始 [TAP](evidence/react-url-import-20261012/model.tap)。覆盖模型、直接 URL 声明/实际调用、官方字节和许可证、真实缓存模块离线计算及原配置不变。
- 首次模型测试为 6/7：测试正则将源码注释中的 import() 说明误判为执行表达式。修正为排除整行注释后再检查；没有放宽生产校验。初次完整日志保留在本轮本地验证目录，不冒充最终 PASS。
- 完整 builder/JSON 离线及失败关闭回归：已更新 5 个测试，复用现有 CI 文件入口；本环境未执行，NOT_TESTED。
- 原 TOC 扫描模型没有业务变更；不重跑其旧 6 项来充当新依赖验收。
- 真正 CDN 直连、Native 完整报文、Mac Chrome Run/Stop、JSON 安装、ECharts：NOT_TESTED。本次 D3 计算模块不是 ECharts 完成证明。

测试过的源码 Git blob：main.js `d8e266377be9d1bc344dba93f90e95a7ce630b71`；heading-stats.js `8e3c18d69e0b14f370c8b61cfb5d6732b51722c9`；heading-stats.test.mjs `c9cb6ea3577be308cc85fedc2ce42f8c0de7b635`；兼容适配器 `a6188ce1cdd59943c653e203b88e51a82a0173ba`。完整 builder 测试文件仅语法检查，blob `3d320560abc1413014b8aba731fc5303a5218cb4`。

## 后续

按 [续接 GOAL](../prompts/goal-react-url-import-completion.zh-CN.md) 先完成已有组合的真实 builder/Chrome 验收，再做实际 ECharts ESM URL、依赖图/体积和生命周期验证；另行补齐浏览器仅源码入口的新依赖准备。不要把用户退回油猴式声明，也不要把本地项目成功等同于全部入口已支持。
