# AI 智能访问 R1 · 实施与并行边界 · 2026-10-14

## 本轮文件负责人和范围

仅写入 `src/ai-smart-access/**`、`examples/sidebar-tools/ai-smart-access/**`、
`tests/environment/ai-smart-access-r1.test.mjs` 和用于固定集成的
`manifest.json`、`official-tools/catalog.json`、`src/sw.js`、
`src/entrypoints/sidebar-tool-host.js`、`src/ui/sidebar-tools.js`、
`src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools/installation.js`。
不修改 Browser SDK 公共 API、Task Runner、Cookie 授权边界、其他工具 UI/源代码。
请其他 Agent 在写入以上公共文件前核对当前 main 和变更。此记录描述范围而不声称锁定文件。

## 产品和调用合同

- 官方可选安装 `ai-smart-access`；v1 工具包只声明 `ai.access`。
- 工具沙箱只能请求 `aiAccess.status`（只读）；任何写操作要求固定 Side Panel
  可信 DOM 的真实点击、安装时授予的 `proxy` 必需权限、已安装的相同包字节摘要、enable 和撤权 epoch、
  live `runtime.getContexts` extension 文档/来源匹配。不得伪造授权回执。
- `aiAccess.enable` 与 `aiAccess.disable` 为浏览器全局代理设置的单按钮命令；
  `aiAccess.activate` 仅激活态显示且不接受 URL 指令。
- 严格本地 PAC 命中 chatgpt.com、openai.com、claude.ai、gemini.google.com、
  perplexity.ai 及其真正的子域名；非匹配域名返回 DIRECT；代理路由不存在
  DIRECT fallback，PAC 设置标记 mandatory。查询、路径、包含相似字节的域名无权限。
- STOP 先记录 durable 停止意图、再仅执行 `chrome.proxy.settings.clear({scope:'regular'})`、
  后核对 `levelOfControl`；不设置全局 DIRECT。
- 与其他扩展冲突不覆盖，未验证应用/释放不得报告成功。
  工具停用、卸载以及 Service Worker 恢复均需要验证清理完成。

## 尚未部署的服务端 API（BLOCKED）

`src/ai-smart-access/provider-config.js` 是扩展开发者控制的可信配置，默认空。
投入真实服务前：由用户自有/合法代理运营方提供经审查的 HTTPS 服务器和实际可用线路；
服务端对设备码以及用户输入的激活码做服务端验证、限速、撤销、过期控制。
扩展只接受其本地固定 API origin 的声明式 `lease`，不允许远端任意 PAC 或扩展 JS。

- POST `activateUrl` JSON `{deviceId,code}` → JSON
  `{leaseId,expiresAt,endpoint:{scheme:'https'|'socks5',host,port}}`
- POST `verifyUrl` JSON `{deviceId,leaseId}` →
  `{active:true,lease:{leaseId,expiresAt,endpoint:{scheme,host,port}}}`
- 两 URL 同 HTTPS origin、无查询/片段/用户信息；`leaseId` 是短效撤销标识，
  不作为永久账户凭据；租约有效期最多 3 天，后台最迟每五分钟核验，过期主动停止；
  网络暂不可达时不得将受保护域名静默降为 DIRECT。
- R1 仅支持无需代理用户名/密码的 HTTPS 或 SOCKS5 端点；若后端必须代理认证，
  需独立设计受信任 `webRequestAuthProvider` / onAuthRequired 控制，不提交空账号伪实现。
- 需要补充代理连通性、时间有效性、设备限额、真实状态与是否存在服务端固定出口的验收。

## 排除历史不安全机制

历史 `src-bEX` `settingProxy()` 的 `url.includes()` 域名判断及 PAC 字符串插值风险，
`UtilDevice` 的弱设备码/日志，`CSDN_VIP_LOGIN` 下载执行服务端脚本以及
`setCookies()` 的任意域写入均不复制。
R1 无 URL 命令和 Cookie 会话移植；如果需要未来授权交换，
须先建立可审计的一次性 HTTPS 票据和站点所有权证明，另行独立验收。

## 证据级别

按 SOURCE_WIRED / NODE_PASS / BUILD_PASS / NATIVE_PASS / PROVIDER_PASS 单独登记。
GitHub Actions 成功不等于 Mac Chrome 实际网络路由生效。没有相同候选原生证明，
始终 NATIVE_NOT_TESTED；没有服务端就是 PROVIDER_BLOCKED。
