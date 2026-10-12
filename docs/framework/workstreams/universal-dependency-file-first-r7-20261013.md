# Universal Dependency R7 — File-First / SHA 共享阶段证据账本

日期：2026-10-13。范围仅为第三方依赖资产和旧版独立资源迁移，**不覆盖 Framework R8 Browser SDK** 的 chrome-types、WXT/webext-core、Host、Authority、Browser API 映射。

## 最新基线和交付边界

- 审查起点：`de52893a69d5107b4d60f837c9e570d7298ac588`（远端 `main`）；本文件随实际提交更新，不把旧 SHA 误称为未来 HEAD。
- **已在此前源码具备**：`src/libs/runtime-contract.js` 唯一预装 Catalog、`loader.js` 对扩展文件及 manifest SHA 的校验、`dependency-manager.js` 按 hash 保存 IndexedDB 字节、每 namespace 审核/lock、`execution-source.js` Page 原子拼接及校验、Controller R4 ESM 固定图。
- **本次新增**：同一个已被显式批准且实际 HTTPS 下载的 `(URL,SHA-256)` 元数据共享索引；新程序 `inspect` 可看到 `sharedCacheChoices`，`prepare({explicitUserAction:true,selections:[{order,sharedAssetSha256}]})` 复用已验证 SHA 字节而**不下载**，但仍产生全新 pending review，随后还需要当前 namespace 自己的 `approve` 和锁才能执行。
- **故意不做**：物理写入 `dist/libs`、跨 namespace 共享锁或安装权限、由扩展 SW 动态 eval、把 ESM exports 冒充全局、修改 R8 SDK、把 `chrome.userScripts.js` 多来源直接设为正式默认模式。
- 本阶段验收等级：源码/Node 测试和 GitHub CI 需分别记录；**没有同包 Chrome/Mac 原生回执即 NOT_TESTED，不得标记 R7–R10 完结。**

## 旧文件 → 机制 → 目标世界 → 新职责 → 结论（源码审计）

| 旧来源 | 旧加载及消费者 | 世界 | 新职责 | 迁移决定 / 风险 |
|---|---|---|---|---|
| `src-bex/background.ts` | TS `import lodash/moment/axios`，旧构建器静态打包 | Background | WXT 固定入口 / 各产品显式 import | REPLACE；不共享 Page 全局 |
| `scrapyJsChrome/background-sw.js` | `BACKGROUND_SCRIPTS` + `importScripts(...)` | SW classic | 既有受信 Background 打包与 Native transport | ADAPT；不把用户库注入 SW |
| `src-bex/manifest.json` | `content_scripts.js/css` 独立文件 | ISOLATED | 现有可信 WXT Content/Relay | ADAPT；不能向用户包授信 |
| `src-bex/my-content-script.ts` | `appendScript(getURL(...))` 加载 core/lodash/moment/axios/js-cookie | MAIN | USER_SCRIPT 固定文件候选加载计划 | ADAPT；未 await onload/error，不能照搬 |
| `src-bex/ChromePage.ts` | `addScriptTag/addStyleTag` DOM 插入 | MAIN | Page 受控加载/生命周期 | REPLACE；有 `new Function` 和注入风险 |
| `assets/js/core/brige.js` | CustomEvent + 页面全局 Promise 回调映射 | MAIN | 既有 Page port/Host/Authority | REPLACE；丢响应/清理风险 |
| `assets/js/core/axiosx.js` | Bridge HTTP 调用 | MAIN | 现有 SDK network 经授权 Broker | REPLACE；不是 Axios npm 包 |
| `assets/js/core/appStorage.js`, `appLocal.js` | Bridge 存储全局 | MAIN | 现有授权存储/SDK | REPLACE；不得开放全局特权 |
| `assets/js/core/common.js` | notify Bridge helper | MAIN | 已有通知能力再映射 | NEEDS_REVIEW；不是第三方 npm |
| `assets/js/lodash.min.js` | file 全局注入 | MAIN | Page/Controller `_` 独立固定资源 | ADAPT；新旧版本不同 |
| `assets/js/moment.min.js` | file 全局注入 | MAIN/ISOLATED | 已批准 Day.js 迁移 | REPLACE；不得冒充 Moment 全量兼容 |
| `assets/js/axios.min.js` | file 全局注入 | MAIN/ISOLATED | 新版固定 Axios opt-in | ADAPT；网络授权独立 |
| `assets/js/js.cookie.min.js` | file 全局注入 | MAIN/ISOLATED | 新版固定 jsCookie opt-in | ADAPT；作用域不自动跨世界 |
| `assets/js/custom_event.js` | Content 监听 MAIN 自定义事件并转发 | ISOLATED | 既有受控 relay / messaging | REPLACE；数据未经授权可伪造 |
| `assets/js/detect_focus.js` | Content 监听 focus/click/keydown/mousemove 并发消息 | ISOLATED | Time Review 独立产品负责 | REPLACE；不是公共依赖，不迁入 runtime |

证据：`docs/contracts/source-snapshots/todo-src-bex/src-bex/` 与 `docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js` 的文件内容；不是旧版 Chrome 通过证据。

## 真实世界当前边界

| 作者使用场景 | 已存在机制 | 本轮变更 | 独立文件执行状态 |
|---|---|---|---|
| Controller Worker | 固定默认库 + R4 ESM linker，零参 `main()` | 不改 Worker 模型 | 仍采用现有受控组合；未验收多文件 Worker |
| 开发中 Controller 单文件 | 已有固定 ESM 图准备 | 不重写编译器 | NOT_TESTED 新方案 |
| Page USER_SCRIPT | 审核 HTTPS `@require` + 原子 compile | **同 URL 跨程序离线共享 SHA 字节** | `js:[{code}]` 仍是正式安全路径 |
| Content ISOLATED | WXT 固定包 | 不授信用户下载代码 | 非本轮 |
| 网站 MAIN | 显式高级兼容 | 保持默认禁用 | 非默认 |
| React/Vue Page | 固定框架、受控组件编译 | 仅复用 hash/授权规则 | 独立文件待同世界 native 验证 |
| Side Panel 独立工具 | `OpenDeskTool` 沙箱 | 不注入宿主全局 | NOT_TESTED 新方案 |
| Background SW | 可信固定入口 | 禁止用户库注入 | 非用户依赖运行世界 |
| Native 多文件项目 | package/lock 和已有构建器 | 不复制新 npm installer | 现有固定 bundle |
| Scheduled / Cloud | 固定 revision + 原 Runner | 不创建第二资产仓库 | 恢复/撤权待专项验证 |

## R7 共享内容调用链（已编码，仍以 CI 结果为准）

1. A 程序通过原 `prepare` 在受控 HTTPS 下载后形成 pending review。**此时全局共享来源索引为空**。
2. A 程序的 `approve` 同事务写入 namespace lock、引用和共享 `url → SHA` 元数据；只有 `sourceKind=https, acquisition=download, resolvedUrl=url` 的真实下载可进入共享索引。
3. B 程序 inspect 返回 `sharedCacheChoices`；此数据**不是**批准或执行令牌。原 `cacheChoices` 仍只表示 B 自己已批准的缓存。
4. B 用户通过现有受信 RPC 明确提交 `sharedAssetSha256` 选择；Resolver 校验同 URL 关联、全部字节及 SHA 后，返回新的 pending review；**无 fetch、无需下载权限**。
5. B 必须独立接受 SHA/风险，`approve` 产生 B namespace 的不同 lockId。运行时仍经现有 `loadForExecution`、Site/Authority/RunHost 验证。
6. 原下载来源 URL 改版形成新 SHA，不覆写 A 旧锁；本地上传的替代字节和仅 pending 的记录不能伪装为网络已批准来源。

## File-First 的下一道正式门槛

`chrome.userScripts` 的 `file` 来源是扩展安装包内固定相对路径，**不能指向 IndexedDB 的虚拟文件**；用户新下载资产仍应通过该 API 支持的受控 `code` 注入，或在 sandbox/Worker 采用已经验收的转换执行模型。单纯拆 `sources.join('\n;\n')` 为若干 ScriptSource 未能证明异常传播、同步 fail-stop、作用域和 Stop 生命周期；未得到 Chrome 同包回执前，保留原有原子编译器。安全边界依照官方 `userScripts` 文档与 MV3 远程代码政策。

## 精准后续任务（不与 R8 重叠）

- P1：给 Page 固定包 `file` 路径设计含执行完成哨兵的受控预编译资源；同包 Chrome 先试验非生产默认路径。
- P2：让 UI 消费 `sharedCacheChoices` 并提供“复用已审核字节 / 在线下载”的显式操作；确保来源版本与许可证展示。
- P3：将同样的 SHA 复用带给 Controller ESM 固定图、React/Vue 组件和 Native 项目，但不能把 Classic 的 globals 转成 ESM exports。
- P4：Chrome restart、离线、撤权、版本升级、Stop、已安装工具、Scheduled、Cloud 全链路真实验收；性能以 SHA 资产字节和实际浏览器 profile 量测，尚无量化结论。
