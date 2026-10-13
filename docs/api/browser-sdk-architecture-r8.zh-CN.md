> **R9 预发布优先级（2026-10-13）**：本文件为 R8 历史架构记录。现行接口以 `browser-sdk-prelaunch-contract-20261013.zh-CN.md` 和 `src/framework/sdk/browser-contract.js` 为准；原 35 项不能再强制兼容。R9 已移除 7 项未实现 Media/Speech 与 2 项未开放 Notifications，完整消费者迁移、统一 Cookies SDK、原生 Chrome 验收仍是独立待办。

# Browser SDK R8 · 统一架构与第一批真实提交

> 实施基线：远端 main `a6f68e04bf9788d7f287385a1081ca973a9a4990`；R8 是增量、分阶段交付。现阶段不得宣称 Chrome API 全量覆盖或 Cookie Editor 原生打通。

## 唯一执行路径

`OpenDeskSDK.browser`（已安装的工具沙箱）→ `src/ui/sidebar-tools.js`（Side Panel 校验并生成单次 intent）→ 既有 `BROWSER_HOST_PROTOCOL` → `src/platform/chrome/context-menus.js`（真实 Sender、toolId、packageHash、installEpoch、Origin、Chrome permission、document）→ 既有 `browser-tabs.js`/网络/截图等 Driver → Chrome API。Controller 仍走现有 RunHost / Authority，不合并身份空间。

- Chromium 官方 JSON/IDL：原生能力发现层，不产生权限。JSON Schema 目前仅固定 8 个 namespace；IDL及其余命名空间须继续同步，缺漏不标为 UNSUPPORTED。
- `browser-contract.js`：唯一获批准的正式公开操作注册表；原 35 项不变。
- `browser-sdk-compatibility-map.json`：35 项旧 SDK 的向后兼容映射和原生来源关系，映射到 `chrome.*` **不自动开放**。
- `chrome-native-api-catalog.json`：离线确定性自动生成的发现目录。对未知 minChrome、Chrome permissions、运行上下文一律保留 null / MIN_VERSION_UNVERIFIED，不能推断为 Chrome 138 实测。
- Chrome 原生调用仅在可信 Host / Driver 里；永不对沙箱注册 `chrome[namespace][method]` 或开放完整动态代理。

## 来源与同步

固定 Chromium 提交 `b5485910372708cd11d9a814a3e382fe8da57df3`；上游版权声明随源 JSON 保留，源快照的 Git blob SHA1 必须逐文件核对。

```bash
node scripts/sync-chrome-api-catalog.mjs          # 离线生成（更新本地冻结目录）
node scripts/sync-chrome-api-catalog.mjs --check  # 离线严格漂移核对
node --test tests/environment/browser-sdk-r8-catalog.test.mjs
```

本次 **没有** 修改 WXT、Chrome 原生注入、Permission Store、Scheduled Tasks 或 Host Protocol；不引入 webext-core 依赖。下一批需继续补 Chromium IDL 和更多命名空间，并对每批运行源漂移检查。

## Cookies 的硬性阻隔

`src/platform/chrome/cookies.js` 已被 Controller 使用，不能重写、破坏旧 `getCookies/setCookies/deleteCookiesByUrl` 行为。官方 Cookie Editor 当前处于工具沙箱，不是 BUILTIN_TRUSTED；要接入 Cookie，必须由真正可信的扩展 UI 发起经 Host 认证的独立动作，返回给原沙箱的 Cookie value 必须拒绝。开发中的内部 Driver 不等于公开可调用。所有十项候选在未获 Host 授权及受控 Chrome 验证前仍是 **PROPOSED_NOT_REGISTERED / NOT_TESTED**。

## 版本与事实等级

- SDK API `1.0.0`、Host Protocol `opendesk.browser.v1` 维持兼容，不因发现层新增变更。
- Native Source `b5485910372708cd11d9a814a3e382fe8da57df3`、最低 Chrome 138、未来 operation introduced/deprecated 独立建账。
- 已有 Node / GitHub CI 历史 PASS 是各自 SHA 的证据，不能自动提升本轮 SHA；本轮 Chrome 原生 **NOT_TESTED**。
- 四层拆分：原生发现（部分 JSON）→ Driver/Host → SDK 正式公开（保留 35 项）→ 当前候选组件/原生验收（待执行）。
