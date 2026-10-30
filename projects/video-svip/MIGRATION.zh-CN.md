# video-pass → video-svip · 安装身份/数据迁移风险 R0.2

## 为什么必须特别处理
OpenDesk 以工具 ID 作为安装身份、官方分发路径、存储归属和部分权限索引；旧 id=video-pass，新 id=video-svip。
旧本机数据键为 opendesk.sidebar-tools.data.v1:video-pass，新工具使用 opendesk.sidebar-tools.data.v1:video-svip。
当前旧工具写入字段 memberships（最多 5 条用户手动输入的 {id, expiry}），没有真正的会员凭据；**不等于已经具备无损迁移功能**。

## 当前 R0.2 策略
1. 仅在 GitHub main 将新的官方可选应用源码、工具 ID、catalog、允许路径映射和测试统一收敛为 video-svip。
2. 旧包不会被新 ID 自动升级；已安装的 video-pass 在既有 Chrome 配置中可能继续存在。官方 catalog 新版本不会自动删除旧安装；不得宣称已自动迁移。
3. 不自动清理旧存储/安装记录、不复制旧权限/撤权代际/来源 SHA、不绕过安装审批。不得自动为所有用户安装 video-svip。
4. 用户若已经安装并保存会员日期：停止后续卸载；先在真实 Chrome 读取及保护旧记录，再进行明确同意的迁移或人工重新录入，确认新工具读回后再处理旧安装。
5. 下一轮有本机 Chrome 访问能力的 Codex 必须检查实际安装和数据（网页端看不到本机时标记 NOT_TESTED），再决定是否要在现有可信 Host 中实现“一次性有确认的迁移”；若无旧安装，直接继续 R0.3，不为假设问题修改宿主。
6. 若实现迁移，要做安装身份核验、数据格式校验、etag 防冲突、新写入独立读回、审计收据、失败后保持旧数据/旧权限、数据归属隔离与撤权；不得复用旧用户授权到新 ID。
7. GitHub 静态迁移提交 != 用户本机数据迁移通过。NODE / BUILD / MAC_CHROME / REAL_SITE 单独列状态。

## 实施者检查清单
- 先审 src/ui/sidebar-tools/package.js (SIDEBAR_TOOL_DATA_PREFIX/安装身份)
- src/sidebar-tools/official-catalog.js (officialSourceProjectPath allowlist)
- src/ui/sidebar-tools/installation.js (存储/卸载清理)
- official-tools/catalog.json (唯一新 id)
- projects/video-svip/tool.config.json + app.ci.json + tests/environment/video-svip.test.mjs
- 不改老产品的 Cookie Editor / Video Speed Controller 身份，不创建第二个正式业务 UI。
