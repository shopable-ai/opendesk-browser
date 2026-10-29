# ScrapyJS local-runner R1.7

独立手动启动的 Python 服务，唯一写入范围是本目录。真实 `scrapling==0.5` 的 `Selector` 负责解析；标准库 HTTP 负责受限下载，不安装 stealth/browser fetchers。Python >=3.10。无自动启动、无浏览器 Cookie、无现有服务/侧栏 HTTP 生命周期依赖。

## 启动与凭证（Host 对接合同）

```sh
cd examples/sidebar-tools/scrapyjs/local-runner
/Users/mac/.local/bin/python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
.venv/bin/python -m scrapyjs_runner --port 43231 \
  --data-dir "$PWD/.data" --credential-file "$PWD/.credentials/local-task-credential.json" --init-credential \
  --extension-origin chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

命令中的扩展 ID 请替换成实际 `chrome.runtime.id`（32 位 a–p）。只绑定 `127.0.0.1`，仅一个 Uvicorn 服务进程，不使用 reload/workers。`--init-credential` 显式初始化并直接启动：不存在时在 0700 私有目录中原子创建 0600 JSON，secret 使用 48 随机字节（64 个 urlsafe 字符，无 padding），已有文件只核验、不覆盖；目录权限不符时明确失败，不修改无关目录。启动后在可信 Host 文件选择器中选择 `$PWD/.credentials/local-task-credential.json`。首次安装好 venv 后，重复上述 `.venv/bin/python -m scrapyjs_runner ... --init-credential` 命令即可手动启动。省略该 flag 则必须已有凭证文件。

master 文件也可由可信 Host 配置，必须为当前用户拥有、无组/其他用户权限的普通文件（0600/0400），内容为 JSON `{ "format": "opendesk.local-task-credential.v1", "secret": "<32..128 characters>", "endpoint": "http://127.0.0.1:43231" }`。secret 必须匹配 `[A-Za-z0-9_-]{32,128}`，无 `=` padding；endpoint 必须逐字匹配 CLI port。除显式 `--init-credential` 外不生成凭证；不打印/提交凭证，不通过命令行传 secret。master 只用于 session；不直接授权任务。session token 只在内存中，服务重启必须重新获取。

`--extension-origin` 可重复，必须是完整 `chrome-extension://<32位a-p>`。测试可显式指定 `--fixture-origin http://127.0.0.1:<动态端口>`，此精确 origin 才豁免公网 IP 限制；不豁免 scope、robots、重定向或 URL 凭证限制。日常端口 43111/43119 不用于本测试。

## HTTP response contract

除 `/health` 外均需 `Authorization: Bearer <token>`。所有响应 `Cache-Control: no-store`。有 Origin 时只接受 CLI 配置的扩展 Origin；明确拒绝 `null`、网站 Origin、不匹配 token 的扩展 Origin。可信 Native HTTP 无 Origin 时允许 bearer。CORS 仅返回精确允许 origin，不使用 `*`，预检不授予访问权限。请求不得携带重复安全头；Host 必须是本机 listener。

| 方法/路径 | 输入 / 成功结果 |
| --- | --- |
| `GET /health` | 无鉴权；`{status:"ok",service:"scrapyjs-local-runner",version:"1.7.0",scraplingVersion:"0.5"}` |
| `POST /v1/session` | master bearer + `{owner,origin,scope}` → `{token,tokenType:"Bearer",expiresAt,expiresIn:900,owner,origin,scope}`；expiresAt 为 Unix 秒。owner 为可信 Host 提供的 `toolId:installEpoch:packageHash` 安装身份（最多 256 字符）。相同 owner 可刷新；旧 token 到期前仍有效，不触发任务重放。 |
| `POST /v1/revoke` | master bearer + `{owner}` → `{revoked:true,workerExited:true}`；先撤销该 owner 全部 sessions 并等待它的 worker 真退出。收尾失败返回 503，不假报成功；不影响其他 owner。 |
| `POST /v1/runs` | `{requestId,mode:"preview"\|"full",config,previewPages?:1..3,previewRunId?,configHash?}` → snapshot（202，新建；200，完全相同请求幂等返回）。full 必须提供已成功非空 preview 的 ID 与 hash，并逐字节规范化比较同一 config/owner/scope。previewPages 默认 1，只限制 preview，不修改 config。 |
| `GET /v1/runs/by-request/{requestId}` | **路由在 `/{id}` 之前**；同 owner/scope 只读查原任务，可恢复响应未知的 POST，找不到为 404。禁止用新的 requestId 重试未知请求。 |
| `GET /v1/runs/{id}` | snapshot |
| `GET /v1/runs/{id}/records?offset=0&limit=50` | `{records,total,offset}`，offset 0..2000，limit 1..200 |
| `POST /v1/runs/{id}/stop` | 等待原 worker 真正退出并释放资源后返回 snapshot；重复 Stop 幂等，无终态重放。 |
| `GET /v1/runs/{id}/export?format=jsonl\|csv` | 流式磁盘结果，无全量组装；取请求开始时已提交的 recordsCount 前缀。JSONL 保留数组/对象/null；CSV 顶层字段列，list/object 为紧凑 JSON，null 为 `null`，空串为空，UTF-8。 |

snapshot 固定字段：

```json
{"runId":"uuid","requestId":"host-id","previewRunId":null,"configHash":"sha256:...","mode":"preview","status":"RUNNING","pagesVisited":0,"recordsCount":0,"fields":["title"],"completeness":{"title":{"nonEmpty":0,"total":0,"ratio":0.0}},"errors":[],"stopReason":null,"workerExited":false,"previewPassed":false,"config":{"url":"https://example.org/","itemConfig":{"title":"h1::text"}},"scope":"https://example.org"}
```

达到页数/1800 秒/2000 条预算为正常 `COMPLETED`、errors `[]`，具体 stopReason 为 `PAGE_LIMIT` / `TIME_LIMIT` / `RECORD_LIMIT`；preview 仍可在非空且 worker 退出后认证通过。手动 Stop 为 `STOPPED`。

状态：`RUNNING → COMPLETED | FAILED | STOPPED`；停止处理中可见 `STOPPING`。服务启动先取得 data-dir 独占锁，旧未终态转 `INTERRUPTED`，不自动重跑；终态只在进程确认退出后 `workerExited:true`。错误统一 `{error:{code,message}}`（400/401/403/404/409/413/415/422/429/503），snapshot.errors 为 `{code,message}` 数组。403/404 不泄露其他 owner/scope 的任务。requestId 在 owner 内永久幂等：配置或 mode 等变化返回 `409 IDEMPOTENCY_CONFLICT`，不创建第二任务。总并发 1，无无界队列；忙时新请求 `409 WORKER_BUSY`。

## 原 DSL 保真与明确限制

已读取 `../src/app-model.js`、`../adapters/capture-policy.js`、`../vendor/scrapyjs/src/item/ItemLoader.js` 与 `item-loader-extraction.js`。

支持原 `url,itemConfig,nextPageSelector,maxPages,dedupeKey,timeoutMs,waitForSelector`。`_listContainer` 的**直接子元素**按 `_listItem` 过滤，重叠容器不重复；无 listContainer 时单个对象记录。`.` 选择当前项；其余 CSS 限定为后代查询。CSS 字符串末尾 `::text/::innerText/::<attr>`、描述符 `read:text|attr`、`cardinality:one|many|auto`、嵌套字段。`one` 多匹配报错；`many` 始终数组；`auto` 0/1/多为 `""`/标量/数组。原 ItemLoader 空字段是空串而非 null；无匹配列表原 parse 为 null，这里 records 规范化为 []。JSONL/CSV 不擅自改写空串、列表或 JSON null。默认 a 取文本或 href，img/video/audio 取 src；attr 保留原相对 URL，不偷偷转绝对链接。按当前 vendor 的 read()，`::text`、`::innerText` 与描述符 `read:"attr",attr:"text"|"innerText"` 都是保留文本读取；`read:"text"` 同样读取文本，其他 attr 读取原始属性值。

分页仅同 scope 的静态下一页链接，disabled/aria-disabled 结束；不模拟 click、JS、登录或滚动。waitForSelector 仅检查下载后的静态 HTML，不等待 JS。`detail,processing,validation,fieldRequirements`、XPath、HTML 读取、未知配置/描述符均明确 `422 NOT_SUPPORTED` 或 `INVALID_CONFIG`，不丢弃。

## 生命周期、安全和预算

服务独立 owner 管理一个 worker 子进程，任务与 HTTP 客户端断连无关。SQLite 持久请求、状态、记录；JSONL 写盘并以已提交 SQLite 记录为准在启动时校准。每次 page 提交，不重放。Stop 使用事件通知、有限等待，必要时 terminate/kill 并 join 后才确认退出。父进程消失时 worker 自检退出；服务重启不认领/重放旧进程。

预算上限：50 页、1800 秒、2000 条、并发 1；preview 1–3 页且不超过 config.maxPages。单响应 2 MiB、单记录 16 KiB、每 run JSONL 8 MiB；最多 100 个持久任务及总记录字节 64 MiB，满额明确拒绝，不静默删幂等记录/preview。配置 8 KiB / itemConfig 4 KiB，HTTP body 16 KiB。每分钟端点限流、最多 256 活跃 session、最多 2 并行 export。每次下载解析 DNS，拒绝任何非公网地址；TCP 连接固定到已核查 IP，TLS 仍校验原 hostname，禁环境代理；最多 3 次同 origin 重定向。robots.txt 必查，404 视为无规则，拒绝/网络失败不绕过；robots 最多 256 KiB，UA `ScrapyJSLocalRunner`。不发送 Cookie、Authorization 或页面凭证到目标。

## 验证

```sh
.venv/bin/python -m unittest discover -s tests -v
```

测试在动态端口启动本服务和精确声明 fixture HTTP，实际导入/执行 Scrapling，不 mock Selector。证据脚本为 `tests/test_service.py`（可单独运行 `.venv/bin/python -m unittest discover -s tests -p test_service.py -v`），包含动态 fixture、原始 worker PID 消失检查、硬重启、完整 full hash 绑定与流式导出的独立文件读回。原始 JSONL/CSV 和断言证据写本目录 `evidence/`；`pip-freeze.txt` / `scrapling-package.txt` / `pypi-scrapling-0.5.json` 保存实际依赖及官方 wheel/sdist SHA，测试秘密/临时数据在被忽略的 `.test-data/` 内，结束清理自己启动的进程。浏览器 UI/Native bridge/正式生产安装不在此独立服务测试范围，标记 NOT_TESTED。

`requirements.txt` 声明三个直接依赖，`requirements.lock.txt` 固定本轮 Python 3.11 实测的完整传递依赖；其他 Python/CPU wheel 的安装仍需在目标机器检查，不能据本机锁宣称跨平台通过。
