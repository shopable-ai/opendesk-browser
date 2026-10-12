# 产品机会与竞品持续研究流程（可重复执行、避免重复造表）

> 本轮仅建立**仓库内的可重复执行流程**。没有配置 GitHub Actions 定时 Cron 或 ChatGPT 自动提醒，不声称“已在后台每周监控”。

## 单一记录模型

- 只用 `opportunity-register.json` 作为 `OPP-xxx` 的真实机会记录来源；`docs/product/browser-automation-feature-catalog-r8.zh-CN.md` 仍是**唯一 188 功能账本**；`E01–E40` 是工程执行追溯。三者不互相替换。
- 同一机会按 `industryId + problem + targetUser + deliveryGoal` 归并；即使目标网站不同、产品名不同也不自动生成新机会。合法需求细分须说明与旧机会的核心差异及证据。
- 只增量分配下一未占用 `OPP-xxx`，永不复用/重编号；已合并机会保留 `mergedInto`、`status=ARCHIVED_DUPLICATE`；关联 R8 原始 ID，不把 OPP ID 写成可执行接口。
- 证据字段是 `sourceURL, publisher, type, checkedAt, claim, version, confidence`。`OFFICIAL_POLICY` 优于商店描述；商店高于二手榜单；用户社区是抽样线索而非代表性统计。用户行为/频次必须来自真实访谈、日志或可复现实验。
- 永久区别 `HYPOTHESIS`、`SOURCE_IMPLEMENTED`、`BUILD_VERIFIED`、`CHROME_NATIVE_VERIFIED`、`CWS_APPROVED`，任何一步不得升级缺少证据的状态。

## 可重复研究任务清单

```text
每周
  1. 打开 Google Chrome CWS Policy 更新、Chrome Platform 博客、TOP30 竞品 ChangeLog
  2. 对有变化的 source URL 更新 checkedAt、摘录和影响，而不是新建同一机会
  3. 标出权限变更/商店下架/接口 deprecation；触发安全工作流复核
每月
  1. 深入抽查 5 个新产品或 10 个现有候选的独立评论与实际用户故事
  2. 更新痛点证据、频次和维护成本实测；重新计算人工 TOP30
  3. 废弃无持续价值的方向，保留 stable ID 和拒绝原因
每季度
  1. 复审 TOP10 行业、TOP5 产品与未来 3 个 MVP
  2. 独立审核安全、合规、真实运行，任一 BLOCKED 不上线
  3. 与现有 R8 188 账本对齐，登记新能力需求而不是复制第二张表
重大 Chrome 政策变化
  1. 标记各分发渠道的阻断条件，暂缓可能违规发布
  2. 专门审核 remote code / CWS single purpose / affiliate / permissions
```

## 数据完整性与验收方法

校验：`schemaVersion` 正确、`id` 全局唯一、`priorityRank` 严格为 1–30 且不重复、`industryId` 有定义、`r8CapabilityId` 必须存在于 188 账本、每条至少一个公开来源、所有引用链接非空、`evidenceCheckedAt`/状态存在；不可编造新下载量或转化率。

新增人力研究数据时，应记录匿名被访者所属岗位、任务执行次数的观测窗口、需求触发频次、愿付价格的测试方法、竞争使用的真实体验；禁止记录个人账号 Cookie、姓名或未授权企业文档原文到公开仓库。

## 跨对话复用方式

每次开始先读取本目录 README 与 JSON，核对最新 GitHub `main` 和原 R8 唯一账本；本次研究新增源先在现有机会 ID 下标注影响，只有不同工作流才新增 ID。文档改动需记录 `base HEAD`、`lastReviewAt`、变更行、证据来源、计划与代码的差异；无 Mac Chrome 原生访问不得标记 95+ 通过。
