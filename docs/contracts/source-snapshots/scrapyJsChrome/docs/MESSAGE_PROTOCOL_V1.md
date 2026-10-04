# Message Protocol V1 (Implemented)

更新时间: 2026-02-28
范围: popup / tb-bridge / background 消息链路

## 1. 请求结构（Request Envelope）

```json
{
  "type": "CHROME_PAGE_EXECUTE",
  "requestId": "popup_exec_...",
  "meta": {
    "protocolVersion": "1.0",
    "requestId": "popup_exec_...",
    "source": "popup|tb-bridge",
    "timestamp": 1700000000000
  },
  "detail": {
    "pageAction": "getUrl",
    "args": []
  }
}
```

兼容规则:
1. background 接收时，`requestId` 优先读取 `meta.requestId`，其次 `request.requestId`，都没有则自动生成
2. 业务参数优先读 `detail`，兼容 `data`
3. `args` 在发送端和接收端都会归一化为数组

## 2. 响应结构（Response Envelope）

### 通用成功

```json
{
  "success": true,
  "requestId": "...",
  "errorCode": null,
  "data": {}
}
```

### 通用失败

```json
{
  "success": false,
  "requestId": "...",
  "errorCode": "E_TAB_NOT_FOUND",
  "error": "No active tab"
}
```

### 脚本执行兼容响应

`testMonkeyFramework` 响应会保留历史字段，同时补充 `requestId/errorCode`:

```json
{
  "type": "testMonkeyFramework",
  "success": false,
  "error": "...",
  "requestId": "...",
  "errorCode": "E_SCRIPT_EXEC_FAIL"
}
```

## 3. errorCode 映射（已实现）

1. `E_DETAIL_MISSING`: detail/BridgeEventName/script 缺失
2. `E_MSG_INVALID`: 消息结构非法（如 BridgeEventName 格式不合法）
3. `E_TAB_NOT_FOUND`: 无可执行 tab
4. `E_SELECTOR_NOT_READY`: selector 未准备
5. `E_TASK_ALREADY_RUNNING`: 爬虫任务并发冲突
6. `E_SCRIPT_EXEC_FAIL`: 脚本执行失败
7. `E_HANDLER_EXEC_FAIL`: 通用处理异常
8. `E_BRIDGE_NOT_READY`: bridge 层未就绪（如 `TB.bridge.send` 不可用）
9. `E_INTERNAL`: 未识别异常

## 4. 发送端实现点

1. popup: `www/popup_crawl.js`
2. tb-bridge: `assets/js/core/tb-bridge.js`
3. background: `background.js`

## 5. 升级注意事项

1. 新增消息类型必须携带 `requestId/meta`
2. 新增错误分支必须返回 `errorCode`
3. 新增 action 必须保证 `args` 为数组语义

## 6. 协议回归测试（已落地）

测试脚本: `test/protocol-regression.js`

运行命令:

```bash
node test/protocol-regression.js
```

当前覆盖重点:
1. popup/tb-bridge 发送端 requestId + meta 注入
2. `args` 非数组输入归一化
3. `detail/data` 与响应 envelope 解包兼容
4. background `getRequestId/mapErrorCode/toSuccessResponse/toErrorResponse`
5. `testMonkeyFramework` 响应兼容与 `errorCode` 注入
6. background 归一化工具:
   - `normalizeDetail(request, options)`
   - `normalizeArgs(args)`
7. 客户端发送防御:
   - 超时返回 `E_TIMEOUT`
   - 空响应返回 `E_NO_RESPONSE`
8. `CHROME_BRIDGE_POPUP`:
   - 缺少 `BridgeEventName` 时抛出结构化错误
   - `module.action` 解析后转发到 `TB.bridge.send`

## 7. 客户端防御策略（已实现）

1. popup 与 tb-bridge 发送消息统一走封装:
   `sendRuntimeMessageWithProtocol(message, { timeoutMs })`
2. 默认超时:
   - `CHROME_PAGE_EXECUTE`: `30s`
   - `SCRAPYJS_RUN`: `120s`
3. 若 background 响应 `requestId` 与请求不一致，客户端记录告警日志
4. 客户端抛出的 Error 会附加:
   - `errorCode`
   - `requestId`
5. 新增客户端侧错误码:
   - `E_TIMEOUT`
   - `E_NO_RESPONSE`
   - `E_RUNTIME_LAST_ERROR`
