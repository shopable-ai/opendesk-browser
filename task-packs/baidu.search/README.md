# 百度搜索 Controller Task

独立业务 owner：本目录。公共开发、安装及发行规则见 [Task 脚本库](../README.md)；SDK 见 [Controller](../../docs/api/controller.zh-CN.md)。

| 内容 | 路径 / 身份 |
| --- | --- |
| 活动作者源码（下一版） | [src/baidu-search-top3.js](src/baidu-search-top3.js) |
| 当前随包预置发行 | [baidu.search.top3@1.1.6](releases/baidu.search.top3.v1.opendesk-task.json) |
| 历史恢复资源 | [baidu.search.top3@1.1.5](releases/baidu.search.top3.1.1.5.opendesk-task.json) |
| 业务测试 | [tests/search-actions.test.mjs](tests/search-actions.test.mjs) |

基准 `122c7167b5b2eaef183fb674b7d773d8d27ccce5` 实读确认当时 1.1.6 包内 sourceUtf8 与稳定源码完全一致，文件名 v1 不等于发行版本。1.1.5 的冻结源码保存在自己的包内，不使用当前活动源码重建旧版本。

R11.2：活动源码新增 `@param` 头部（query、固定 limit=3、showExecutionTab），业务正文与 1.1.6 冻结源码逐字一致；旧包、pin 和版本均未修改。新 v2 包须待正式构建、安装、运行接入与验收后另发新版本，不将当前源码误认为已经发布的 1.1.6。参见 [参数规范](../../docs/api/task-params.zh-CN.md)。

## 用法与边界

从已授权的 https://www.baidu.com 标签页搜索关键词或只读提取匹配的结果页，过滤广告，固定前三条。权限 page.automation，期限 120000ms。实际参数：

```json
{"query":"浏览器","limit":3,"showExecutionTab":true}
```

query 必填、limit 固定 3 且默认 3、showExecutionTab 默认 true；显式 false 跳过显示执行标签页。按包 Manifest 校验，不能以通用滑块演示把固定 limit 改成 1–20。结果和真实错误以业务源码及原 runId/resultId 为准，未知回执不得盲目重跑。

业务定向测试（仓库根目录）：

```sh
node --check task-packs/baidu.search/src/baidu-search-top3.js
node --test task-packs/baidu.search/tests/search-actions.test.mjs
```

修改网站操作留本目录，使用公开 SDK；不在框架新增百度特判。按原候选验证、安装、版本升级规则交付。当前正式包是 legacy paramsSchema；新文本参数头部不回写旧固定包，待 v2 正式支持后另发新版本。此次仅目录/源码对应性核验，未运行上述测试、安装或真实 Chrome。
