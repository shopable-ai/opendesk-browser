# Browser SDK 预发布 API 收敛合同（2026-10-13）

> **用户最新决定，覆盖旧 R7/R8 中“正式 35 项 API 必须保留兼容”的限制。** OpenDesk Browser 仍在开发，尚未正式上线及提供外部 API 使用承诺。旧 35 项是历史开发快照，不是冻结的未来对外合同。

## 冻结的产品方向

- 开发者唯一公开入口仍是 `OpenDeskSDK.browser`，优先复用 Chrome 原生 API、现有 OpenDesk Authority、Driver、Host、Storage 与 Scheduler；不得创建第二套运行时框架。
- **允许破坏性调整**：对重复、不合理、过度封装或过时的 SDK 方法，直接重新命名、合并或删除。无需维护旧签名、别名、deprecated shim 或旧数量分母。正确的能力和安全机制应保留并复用。
- 名称与语义尽量符合 Chrome 原生 API 习惯。仅在功能/返回/授权行为确实不同的情况下使用明确的受限方法名（例如 `getOwned`、`listOwned`）。不能把受限查询伪装成能枚举整个浏览器的原生方法。
- 统一对象参数、Promise、稳定错误码、强身份、opaque 资源 Ref 与有界事件。一个方法应有一个正式调用路径；不能把内部 `approve/execute` 两次 RPC 暴露为用户编程方式。
- 当前第三方安装工具沙箱仍为不可信；官方来源的 Cookie Editor 如果继续运行于沙箱，也不会被当作 BUILTIN_TRUSTED。Chrome Sender/用户真实点击/站点/Document/安装身份/权限/未知副作用仍必须逐项核验。
- Chromium Native Catalog 是发现工具，不自动授予权限或生成动态 RPC。允许精简历史 R7/R8 多余映射、分层、Host 命名、API 版本分支；但保留真正唯一、必要的安全权威。

## 一次性迁移，不建兼容框架

1. 扫描 `src/`、`official-tools/`、`examples/`、`tests/`、`scripts/`、当前文档中对现有 Browser SDK 的所有引用。
2. 确定一份最终 API 清单：KEEP / RENAME / MERGE / DELETE / NEW，以及每项 native 能力、允许世界、权限、实际 Host/Driver、消费者。
3. **同一功能组内一次性修改 SDK、Host/Driver、全部仓内消费者、工具包/示例、测试、类型与当前文档**；去掉旧别名和不再使用的处理分支，不为旧接口留下永久兼容层。
4. 原 `docs/api/browser-sdk-compatibility-map.json` 只可作为迁移检索输入；迁移完成后归档或删除现行引用，不再作为构建/验收的强制 35 项约束。
5. 旧源码和测试快照保存在 Git 历史；既有真实验收收据、603+19、B05、F3、ZIP、权限/目标/撤权/未知效果等行为安全合同不能被伪造或静默放宽。
6. 原正式接口数量不再固定为 35。CI 和四层账本必须以新的唯一批准注册表自动推导数量，禁止为凑绿删除重要负向断言。

## 交付与安全

- 真实改代码，不能只补目录或架构讨论。先完成 SDK 统一与仓内消费者迁移，再推进 Cookies、Tabs、Downloads、Permissions/Storage/Scheduler 和官方接口目录。
- 每项源码接线、Node、Build、原生 Chrome 各自记账；无原生证据则记 `NOT_TESTED`，不擅自打 95+。
- 写入仅在 `main`，先查本地/远端/并行冲突；不得新建分支/worktree/PR、覆盖其他 Agent、强推或破坏性 reset。

**注意**：本文件授权清理开发期不合理的 Browser SDK **API 兼容负担**，不是授权破坏已实现的浏览器安全、业务流程或验收事实。旧 R8/R8.1 所有“35 项旧接口永久兼容”的要求以本文件为准。

## R9 Cookie 观察器功能更新（仍待原生 Chrome 验收）

- `browser.cookies.observe.read({sessionRef,cursor,limit})` 使用只读游标读取有界脱敏事件。事件提供 `seq`，读取返回 `nextCursor`、`gapCount` 和 `droppedCount`，每次最多 50 条。
- `observe.getStatus` 仅返回运行状态、缓存数量、丢弃数量与到期时间，不再消费事件；`stop`、导航、撤权和 Worker 重启仍使旧会话失效。
- 这一阶段仍是可信内置 UI 的 Host-only 能力，不意味着第三方工具获得 Cookie 权限，不等于正式 SDK 全量实现或原生 Chrome PASS。

## R9 SDK 开发期占位清理（已提交源码，未声称原生验收）

当前 `BROWSER_OPERATIONS` 不再登记未实现的 `browser.media.recording.*`（4 项）、`browser.speech.*`（3 项）和 `browser.notifications.*`（2 项），剩余 26 项均为旧有源码已接线项目（不等于全部具有原生 Chrome 验收）。删除仅限运行时正式注册表与相关 Schema、CI 活跃基准、验收表；R5 35 项原始证据与历史映射依然只读保存。

后续必须继续对保留的 26 项做用户调用方式/Host 权限语义收敛，尤其 Tabs Native 命名和 Cookies 可信调用；不得把这一步视为 R9 最终交付。

## R9 可信 Cookie 观察 UI（已提交实际 Side Panel 代码）

- 内置「Cookie 管理 → 近期 Cookie 变化」支持手动开始（15 秒）、检查状态、游标读取与手动停止，全部经既有 Host-only 一次性批准和精确文档校验；不会自动永久监听。
- 事件显示仅使用名称、域名、路径、原因及删除/更新状态，不渲染 Cookie 值；阅读完成、导航、关闭面板均清空 UI 中的观察会话/事件。读取超过缓冲上限后显示丢弃与游标缺口。
- 对同名且 Path/分区不同的 `cookies.get`，不再按数组顺序返回不确定值；以 `E_COOKIE_AMBIGUOUS` 拒绝并要求可信用户先用 `getAll` 识别精确条目。
- 仍需 Node/真实 Chrome 分层验收。普通工具沙箱不可访问本受信界面的 Cookie 明文或会话。

## R9 直接迁移：标准创建与明确受限的 Tabs（2026-10-13）

- Browser SDK 当前公开 `browser.tabs.create({url})`，创建返回 opaque `tabRef`；工具拥有范围内 `browser.tabs.activateOwned({tabRef})`、`browser.tabs.getOwned({tabRef})`、`browser.tabs.listOwned()`、`browser.tabs.removeOwned({tabRef})`。
- 原开发期 `browser.tabs.open/focus/closeOwned` 已从 SDK、Host、Driver、已安装工具示例和测试调用入口删除；不保留别名。仅自己拥有的标签页可聚焦/删除，原生数字 tabId 不出可信 Host。
- Native Catalog 与四层账本已同步新名称，历史 R8 兼容映射仍为归档证据，不再强制运行时签名。
- 接线状态是 SOURCE_WIRED，属于源码层事实；CI/Build 与同候选真实 Mac Chrome 验收须分别读取实际结果，无法进行原生验证时为 `NOT_TESTED`。

## Cookie Store 范围收敛

可信 Host 当前只允许查询已选择网页所在的非无痕 Cookie Store，操作命名为 `browser.cookies.getCurrentStore`，不会伪装为 Chrome 原生全局 `getAllCookieStores` 或枚举其他站点/窗口 Store。R7 旧 `getStores` 属于归档快照，现行可信 Host 不保留别名。
