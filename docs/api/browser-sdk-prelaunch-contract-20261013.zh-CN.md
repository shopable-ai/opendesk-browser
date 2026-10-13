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
