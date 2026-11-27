# R1 测试与验收报告

**任务：** `OD-AI-BENEFITS-R1`  
**项目：** `projects/ai-benefits/`  
**日期：** 2026-11-27  
**运行环境：** Node.js v22.16.0、Python 3.13.5（Linux 容器）

## 本轮名称收敛与重验

- 项目目录及 ZIP 根目录统一为 `ai-benefits/`，压缩包为 `ai-benefits-r1.zip`。
- 扩展显示名称统一为「AI权益中心」，扩展内部包名统一为 `ai-benefits-mv3`。
- 项目标题、扩展显示名、内部包名、原型标题和本地存储键已统一为 AI权益中心 / AI Benefits / `ai-benefits`。
- 名称与元数据调整后重新运行 `npm test`：13/13 通过；扩展 JS 语法、Manifest/Package JSON、两个 HTML 文档解析均通过。
- 以上是交付包名称整理和代码级重验，不代表 Chrome / Edge 原生安装验收。

## 已实际执行

| 检查 | 结果 | 说明 |
|---|---|---|
| `npm test` | **13/13 通过** | Node 内置测试，无第三方依赖 |
| 所有扩展 JS `node --check` | 通过 | `service-worker.js`、Side Panel、渠道模块、状态与白名单模块 |
| `manifest.json` / `package.json` JSON 解析 | 通过 | JSON 格式有效 |
| `prototype.html` HTML 结构解析 | 通过 | Python HTMLParser |
| Side Panel HTML 结构解析 | 通过 | Python HTMLParser |
| Prototype 内联 JS 语法检查 | 通过 | 抽取脚本后 `node --check` |
| 精确 HTTPS 白名单 | 通过 | 允许固定官方域名；拒绝 lookalike、HTTP、userinfo、非标准端口 |
| 重复发起保护 | 通过 | 未解决事务阻止再次创建官方标签页 |
| 中断恢复 | 通过 | `OPENING` 恢复为 `HANDOFF_UNKNOWN`，不自动重试 |
| 取消 / 用户自述完成 | 通过 | 均保持未核验语义，不会产生成功状态 |
| 模拟与正式隔离 | 通过 | `prototype.html` 纯模拟；扩展没有网络请求、Cookie、内容脚本或支付代码 |

## 未实际执行

- 没有在真实 Chrome 桌面 UI 中完成“加载已解压的扩展程序”验收。
- 没有在 Microsoft Edge 桌面 UI 中完成安装验收。
- 容器中的 Chromium Headless 启动尝试超时，伴随 DBus / V8 proxy resolver 环境错误；因此不能把它记为浏览器验收通过。
- 没有登录真实 ChatGPT / Google 账号，没有发起真实购买、付款、赠送、Redeem、Cloud Billing 变更或企业许可证分配。
- 没有调用任何 OpenAI / Google 生产 API、支付接口、私有接口或 OAuth 管理接口。

## 验收结论

**代码级静态检查与 13 项自动测试通过；浏览器安装和真实官方账号流程尚未验收。**

该版本只证明：扩展可以在代码层面安全地把用户交给固定官方入口，并保留“未核验”状态。它不证明任何商品已购买、礼品已发送、Credits 已领取、API 余额已到账或席位已开通。
