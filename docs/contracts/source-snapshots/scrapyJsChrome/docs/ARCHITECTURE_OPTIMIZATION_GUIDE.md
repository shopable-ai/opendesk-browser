# ScrapyJsChrome V3 架构优化指南

更新时间: 2026-02-28
适用版本: `scrapyJsChrome` (Manifest V3)

## 1. 当前架构概览

当前系统可分为 4 层:
1. UI 层: `www/popup_crawl.js`, `www/popup_crawl.html`
2. Bridge 层: `assets/js/core/tb-bridge.js`, `assets/js/core/bridge.js`, `assets/js/core/custom_event.js`
3. Orchestrator 层: `background.js` (消息调度、任务编排、脚本执行)
4. Runtime 层: `assets/js/plugins/ChromePage.js`, `assets/js/plugins/scrapyJs.js`, selector 相关模块

背景进程由 `background-sw.js` 启动并注入历史代码，含 MV3 兼容 shim。

## 2. 已完成的关键修复（参数链路）

已修复以下高频故障源:
1. `CHROME_PAGE_EXECUTE` 参数兼容（`detail/data` 双入口）
2. `args` 标准化（保证下游 always array）
3. 响应解包统一（避免 value 结构错位）
4. `CHROME_BRIDGE_POPUP` 缺失 `BridgeEventName` 时显式报错
5. `executeScript` 增加旧脚本执行兼容路径
6. 安装时注入脚本路径修复: `assets/js/plugins/detect_focus.js`
7. popup/tb-bridge 引入统一 runtime 消息发送封装（超时、requestId 校验）
8. 客户端异常透传 `errorCode/requestId`，便于问题定位与重试策略
9. background 新增消息归一化工具（`normalizeDetail/normalizeArgs`），并接入关键 handler
10. background 消息分发重构为 dispatcher + handler map，降低 `onMessage` 复杂度

## 3. 架构性优化建议（按优先级）

### P0: 协议统一与可观测性

目标: 让所有消息都可追踪、可回放、可统计失败原因。

建议统一 Envelope（请求）:

```json
{
  "type": "CHROME_PAGE_EXECUTE",
  "meta": {
    "protocolVersion": "1.0",
    "requestId": "uuid",
    "source": "popup|content|bridge",
    "timestamp": 1700000000000
  },
  "detail": {
    "pageAction": "getUrl",
    "args": []
  }
}
```

建议统一 Envelope（响应）:

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {},
  "error": null,
  "errorCode": null
}
```

落地要点:
1. `popup`、`tb-bridge` 发消息时统一注入 `requestId`
2. `background` 响应原样回传 `requestId`
3. 错误统一分配 `errorCode`（见第 6 节）
4. `background` 路由层统一走 `dispatchRuntimeMessage(customEvent, request, sender)`
5. `CHROME_BRIDGE_POPUP` 由独立 `handleChromeBridgePopup(request)` 处理，减少主监听器分支复杂度

### P0: 执行引擎职责单一化

现状: `executeScript` 同时承担解析协议、兼容旧脚本、选择执行方式。

建议拆分:
1. `dispatchPageCommand(detail)` 只负责命令分发
2. `runStructuredCommand(cmd)` 只处理 `selectorAction/pageAction`
3. `runLegacyScript(script)` 只处理历史脚本
4. `normalizeRequest(request)` 只处理输入容错

收益:
1. 降低回归风险
2. 新协议扩展更简单
3. 单元测试颗粒度更清晰

### P1: 状态机化爬虫任务

`activeScrapyTask` 目前是布尔语义 + Promise。
建议改为显式状态机:
1. `idle`
2. `starting`
3. `running`
4. `stopping`
5. `failed`
6. `completed`

并附带结构化上下文:
1. `taskId`
2. `startedAt`
3. `pagesScraped`
4. `itemsScraped`
5. `lastError`

### P1: 依赖注入与模块边界

目前 `background.js` 体积大、职责聚合。
建议逐步迁移为模块:
1. `modules/message-router.js`
2. `modules/page-executor.js`
3. `modules/scrapy-runner.js`
4. `modules/bridge-handler.js`
5. `modules/compat-shims.js`

### P2: 兼容层治理

`background-sw.js` 的 shim 是必要的，但建议明确生命周期:
1. `compat/legacy-v2.js`: 保留到具体日期
2. `compat/mv3-core.js`: 长期保留
3. 兼容层每个接口标注: `introducedAt`, `removeAfter`

## 4. 参数传递方式最佳实践

### 建议原则
1. 输入永远归一化: `detail = normalizeDetail(request)`
2. `args` 只允许数组
3. 所有动作改为命令式: `action + args`
4. 禁止无上下文字符串脚本作为新功能入口

### 推荐命令模型

```json
{
  "type": "CHROME_PAGE_EXECUTE",
  "detail": {
    "command": "selector.next",
    "args": [],
    "options": {
      "ensureSelector": true,
      "timeoutMs": 10000
    }
  }
}
```

## 5. 测试体系建议

### 最低保障（必须）
1. 协议兼容测试: `detail`/`data` 双入口
2. `args` 类型测试: array/primitive/null
3. 错误回包测试: `success=false` + `errorCode`
4. 活动 tab 获取失败测试

### 回归场景（建议）
1. popup: 定位表格 -> 下一个表格 -> 启动爬虫
2. bridge: `CHROME_BRIDGE_POPUP` 缺参/错参
3. legacy: `executeScript("page.evaluate(...)")` 兼容

## 6. 错误码规范建议

建议新增错误码表:
1. `E_MSG_INVALID`: 消息结构无效
2. `E_DETAIL_MISSING`: detail 缺失
3. `E_ARGS_INVALID`: args 非法
4. `E_TAB_NOT_FOUND`: 无可执行 tab
5. `E_SELECTOR_NOT_READY`: selector 未初始化
6. `E_SCRIPT_EXEC_FAIL`: 脚本执行异常
7. `E_TASK_ALREADY_RUNNING`: 爬虫任务冲突

返回格式建议:

```json
{
  "success": false,
  "errorCode": "E_TAB_NOT_FOUND",
  "error": "No active tab",
  "requestId": "uuid"
}
```

## 7. 推荐落地路线图（两周）

### 第 1 阶段（1-3 天）
1. 引入 `meta.requestId`
2. 标准化响应 envelope
3. 增加错误码

### 第 2 阶段（3-5 天）
1. 拆分 `executeScript` 职责
2. 完成 message router 模块化
3. 加入协议单测

### 第 3 阶段（3-5 天）
1. 爬虫任务状态机
2. 指标埋点（成功率、耗时、失败分布）
3. 清理冗余旧入口

## 8. 立即可执行的 5 个动作

1. 新增 `normalizeMessage(request)` 工具函数并全量替换
2. 新增 `requestId` 并串联 popup -> background -> response
3. 给 `onMessage` 所有分支补齐 `errorCode`
4. 把 `executeScript` 拆成 `structured`/`legacy` 两条路径文件级函数
5. 增加一套协议回归测试脚本（至少 10 个 case）

---

如果按本指南落地，核心收益是:
1. 参数链路可观测
2. 兼容层可控
3. 后续功能迭代不再依赖“字符串脚本拼接”
4. 回归测试成本下降
