# R10.1 中文使用与 API 文档交付

2026-10-10。分支 `agent/r101-usage-docs-01a12159`，独立文档工作树。起点 `3d1697ff`，本轮只在该分支同步 main `f14b97f0`，没有写主工作目录或 main。

## 用户现在能做什么

[总入口](../../api/README.md)解释扩展、Native、Codex/MCP、Sidebar、Controller、Page 和源码目录的关系。[快速入门](../../api/quickstart.zh-CN.md)可以从现有开发环境跑通 demo-form、读取持久结果、修改源码再运行并核对旧结果。其余六页提供项目格式、七工具参考、Controller、Page UI、Sidebar、npm/HTTPS 与恢复操作。

```text
使用说明与 API
  中文入口/快速入门：已写入；参数与结果层次已核对
  单文件/相对 ESM 项目：已说明；补 title.js，无新增依赖
  七个 MCP 工具：schema/实际消费者已核对；18 个文档调用参数已校验
  Controller：项目/草稿 main、Locator、持久身份、Stop/deadline 已说明
  Page USER_SCRIPT：资产/Shadow DOM/受管清理与 previewId 已说明
  Sidebar：当前模式开关、选择/参数、Run/Stop、重开和归属已说明
  npm/HTTPS/错误恢复：精确锁/缓存、只读对账、未知效果边界已说明
  旧指南/Skill/示例：过时支持口径已修正；误粘贴重复指南已删除
```

文件索引：[机器工作流](r101-usage-docs-01a12159.json)。现有 local-controller/local-page-ui 源码入口没有改动；title.js 是可独立授权的新短示例，不属于目录项目的入口依赖图。

## 校验与复用

执行范围只有文档/示例静态校验：链接/锚点、代码块 JS/JSON、真实 MCP_TOOLS schema、现有项目 schema、示例文件语法和 git diff --check。校验器使用已有 Acorn/Ajv；Ajv v6 将项目 common/type 合同与 prefixItems 规范化后校验，没有安装依赖。命令为 `node /tmp/opendesk-r101-doc-checks.cjs`、`node --check examples/programs/local-controller/title.js`、`git diff --check`；本地校验器脚本和原始输出留在该工作流使用的临时目录，文件哈希/范围在 JSON 中记录。

初始检查：[原记录](../evidence/r101-usage-docs-01a12159/documentation-check-passed.json)。同步 main 后：[第二次检查](../evidence/r101-usage-docs-01a12159/documentation-check-final-passed.json)。最终内容检查入口记在机器工作流 validation.deliveryReceipt 中；这些是文档静态检查，不是新浏览器/Native/F3 PASS。

独立只读核对指出两项表述问题，均已修正：diagnostics 不主动重新解析磁盘源码；Sidebar 发起的运行不能由未登记其身份的 MCP 会话查询。main 同步时显式解决 Skill、R2.2 指南和统一指南三处文字冲突，保留 main 的错误定位说明与独立工作流，未修改继承的产品源码。

原 R10.1 本机/CI 证据保持原候选、级别和失败事实，见[实施工作流](r101-development-01a12159.md)。原 ci-final-3d1697ff.json 只读 SHA-256 已登记，不复制成新候选 receipt。同步 main 带入的产品和证据属于各原工作流，本轮不将原 R10.1 证据升级成该 main 快照的验收。

## 交付边界

开发实现 PR #50 已合入；文档另走独立 PR，由获授权集成者合入 main。浏览器、Native、端口、dist 资源均未占用。没有安装、下载 npm/HTTPS、构建、ZIP、发布或完整框架验收。正式 F3 未关闭，生产/ZIP 按用户要求暂缓。
