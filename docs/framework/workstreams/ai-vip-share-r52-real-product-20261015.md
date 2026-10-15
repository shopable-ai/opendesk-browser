# AI VIP Share R5.2 · 真实兑换恢复与 Provider 边界

日期：2026-10-15。Owner：ChatGPT GitHub 连接。仅写 main，禁止额外分支/PR、强推、生产服务修改。

## 本轮真实缺口与最小改动

- 既有 R5.1 兑换在页面内存中存放 `uncertainKey`，刷新/关闭/重启后可能丢失，给重复消费留下窗口。商品、账号和代理的真实 Provider 尚未配置。
- R5.2 只在独立工具 `examples/sidebar-tools/ai-vip-share/src/main.js`、`index.html`、工具配置、测试、专用 CI 块及 README 中实施最小增量；旧可信代理模块 `src/ai-smart-access/` 保留，没有建立平行 Host/SDK。
- 从 v1 工具 `1.1.1` 升级为 `1.2.0`（仍使用已批准的 v1 工具包格式），`capabilities = ['ai.access','storage.local']`。新授权必须通过既有用户安装/升级审阅，不绕过权限。没有增加网络、开标签页或 proxy 权限。
- 复用已批准 `OpenDeskTool.request('storage.get/set')` 工具命名空间、ETag CAS 和现有宿主 Web Lock，在唯一兑换 POST 之前先写入最小记录并读回。记录只有当前账号 ID、随机 UUID、创建时间、工具身份/版本，不含兑换码、密码、Cookie、Token、代理信息。未知写结果禁止发送 POST。
- 页面重新打开只恢复「待核对交易」，不能通过会员历史缺项判断失败；显式「核对上次兑换」查询专用服务端事务状态，匹配 `accountId + idempotencyKey` 且收到完整 `redeemed` 回执，或明确 `rejected + final=true` 后才清理本地保护。服务错误、仍处理中、权限撤销、账号变更、版本不一致持续锁定，不盲目重复消费。
- 兑换已确认但会员快照刷新失败时，不倒推为兑换失败；会员权益与代理状态仍完全分开，可信代理唯一开关保持原 Host/Worker 安全路径。
- 本轮定向 Node fixture 验证覆盖跨页面恢复、写前持久化、成功终态核验、pending/rejected、账号切换、存储失败、写入回执丢失；fixture 不表示真实 Provider / 真实 Chrome PASS。

## 审核依赖与明确边界

- `PROVIDER_BLOCKED`：生产账号认证、授权会话、会员/Entitlement/SKU、真实兑换/幂等账本、无副作用且权威的终态查询、商城正式 HTTPS 和短效 ticket 服务尚缺合同与部署。Browser SDK `browser.network.request` 默认不带 Cookie，单纯填 URL 不构成真实账号认证；客户端的四个业务端点目前全部为空，所有商业操作安全禁用。专用状态查询请求示意为 `POST voucherStatus {accountId,idempotencyKey}`，最终需 Provider Owner 审核，不能据此假设已经部署。
- `SDK_BLOCKED`：公共 Managed Proxy 全套所有权/撤权/重启保护合同未批准，暂时保留旧可信模块。仅有代理按钮的 UI/Host 接线，不表示真实会员激活或 AI 网站联网成功。
- `NOT_TESTED`：本轮网页 GitHub 环境无法访问用户 Mac Chrome、现有 watcher、真实扩展 ID/Native 配对或 Chrome Profile；无同候选 Native 安装和代理网络验收。
- AdBlock 的固定可信源码指纹仍归独立 Owner。任何 CI 构建失败应以最新同候选日志为准，不能为了 AI VIP Share 改 AdBlock 审计锁。

## 文件所有权、测试和验证级别

本轮文件：`examples/sidebar-tools/ai-vip-share/src/{main.js,index.html}`、`tool.config.json`、`README.zh-CN.md`、`tests/environment/{ai-vip-share-r51-member,ai-vip-share-r5-ui}.test.mjs`、`.github/workflows/sidebar-tools-r1.yml` 的本工具专用块及本记录。未申请独占 dev watcher / dist / Mac Chrome / CFT / Production；对其他 agent 的新提交和本任务外文件保留原样。

候选 HEAD / commit、CI run / Node PASS / BUILD PASS 与被 AdBlock 阻塞的事实应以实际 GitHub 回执填入最终交接；无新证据的产品 UI、视觉、交互、无障碍、商业 Provider、Native 和安装生命周期均不得自评 95+ 或 PASS。

## 最少剩余路径

1. Provider Owner 审定和上线身份会话、会员账户、兑换预检/消费/终态查询、账本，以及正式商品目录。审核 session 获取途径与每次 Browser SDK 网络调用授权，避免余额刷新反复弹窗。
2. 合同确定后只在本工具消费端接线四个 URL、真实失败状态、资格和授权，升级必要网络/标签页权限，办理安装重新审阅。
3. 激活 ticket + 安装回跳服务具备短效签发与单次核验后再实现客户端三路径续接，不静默安装、不直接消费。
4. SDK Owner 审准 Managed Proxy 安全合同后迁移消费端；保留完整 Web Lock/STOP/owner/epoch/撤权保护，解除遗留模块只能单独验收。
5. AdBlock 阻塞归属 Owner 修复后，同候选 Browser 构建、真实 CFT/Mac Chrome 安装更新/账号/兑换/代理 STOP/冲突/撤权验收。
