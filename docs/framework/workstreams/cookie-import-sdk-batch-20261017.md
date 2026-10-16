# Cookie 批量写 SDK / Host · 2026-10-17

- Owner：当前 executor；main 原位协作，不建分支/worktree，不提交/推送。
- 已证实通用缺口：公开 SDK 仅单条 set；可信 Side Panel 每次 set 独立确认，循环导入需要逐条点击。属于通用 SDK/Host 能力，不放入工具业务。
- 调用链：Registry 派生 SDK → opaque iframe Bridge → 可信 Side Panel 单批确认 → 既有 context-menus Host / installed identity / exact intent → browser-cookie-host.executeInstalled → 既有 Cookie Service set + native exact readback。
- 写入范围：src/framework/sdk/browser-contract.js、browser-schemas.js；src/platform/chrome/browser-cookie-host.js、context-menus.js（必要静态 write 路由）；src/ui/sidebar-tools.js；tests/environment/browser-sdk-r9-installed-cookies.test.mjs、browser-sdk-r9-installed-host.test.mjs、browser-sdk-r7-trusted-cookies.test.mjs、browser-sdk-freeze.test.mjs、browser-sdk-r11-generated-catalog.test.mjs；docs/api/browser-sdk-execution-manual.zh-CN.md、browser-sdk-interface-matrix.json、browser-sdk-binding-catalog.generated.json、browser-sdk.developer.generated.d.ts、browser-sdk.developer.generated.md。写前复核当前 diff，保留并行改动。工具/examples、Cookie 原生 Driver cookies.js、native driver、dist 均只读。
- 接口：browser.cookies.setMany({url,cookies:[现有 set 参数去掉 url]})；1–50 条、整个参数 JSON UTF-8 ≤12000 bytes；工具建议按 ≤11500 bytes 分批。不增消息预算。
- scope：同一个 URL / 当前 write grant；所有 row 的有效 Store/Partition 必须一致且获准；row.path 允许子路径。全部 schema/scope 预检后才写，逐条复用 set，不重试。
- 回执：{saved:number,verified:number,results:[{index:number,saved:boolean,verified:boolean,code?:string}],stopped?:true}。首个失败/unknown 即停，保留先前已确认成功；不返回值或错误消息正文。unknown 的 false 表示未确认，不能推断未产生副作用。
- 资源：仅 Node 定向测试及静态检查；不启动 CFT、dev、build 或占用 dist/Profile/端口。当前无浏览器连接证据；Chrome/Build NOT_TESTED。
- 通过条件：单批 exact payload 一次性确认；全部预检；同站点/Store/Partition；子路径；中途失败/unknown 停止；撤权/更新/禁用/真实 sender 与安装身份保护；回执脱敏；静态 Registry/Schema/Host/SDK/manifest capability 对齐。
- 测试复用：已读 testing-guide 与 R9 installed Cookie/Host 测试；新接口改变相关输入，运行这些受影响 Node 测试。历史原生证据不提升为本轮 PASS。

状态：SOURCE_WIRED / NODE_PASS；BUILD / CHROME_NATIVE NOT_TESTED，交给 leader 的独立快照验收。未执行 commit / push。

实现与验证进度：
- 已接入 Registry 派生 Facade/Schema、现有 Host Cookie write 路由与单批 exact intent、可信 Side Panel 批次条数确认、executeInstalled 全量预检 + 原 set 逐条执行与脱敏回执。原 Host-only approve/execute 不开放 setMany。
- 批量 Cookie/Host/原 Driver/Freeze 定向 Node：100/100 PASS（2026-10-17），包括 27 行、literal 子路径、严格 12000 UTF-8 字节边界、后续坏 schema/Store/Partition 零写入、ifAbsent conflict、部分 unknown/撤权停止、intent 顺序/内容/长度绑定和一次性消费、foreign sender/安装身份。
- Registry/生成类型文档静态检查与修改 JS 的 node --check、git diff --check PASS。
- 保留首次测试缺陷记录：新 Host 测试定义早于顶层 await 后 sender 初始化，已移到模块初始化后；历史固定 11 / 73 项计数需随新增接口最小更新。未修改产品行为以迎合测试。

最终定向 Node：**132/132 PASS，0 fail / skip**；新增最大 50 行边界、原生精确回读不匹配、实际 Browser Host 中途 Chrome 网站权限撤销后部分回执及停止验证。命令：

```sh
node --test --test-reporter=tap tests/environment/browser-sdk-r9-installed-cookies.test.mjs tests/environment/browser-sdk-r9-installed-host.test.mjs tests/environment/browser-sdk-r8-cookies.test.mjs tests/environment/browser-sdk-r7-trusted-cookies.test.mjs tests/environment/browser-sdk-freeze.test.mjs tests/environment/browser-sdk-interface-matrix.test.mjs tests/environment/browser-sdk-r11-bindings.test.mjs tests/environment/browser-sdk-r11-declarative.test.mjs tests/environment/browser-sdk-r11-generated-catalog.test.mjs tests/environment/browser-sdk-r106-cookie-contract-gaps.test.mjs tests/environment/browser-sdk-approval-timeout.test.mjs
```

- `node scripts/generate-browser-bindings.mjs --check-developer` PASS（74 个公开接口）；Freeze 定向测试同时验证 Registry/Host roster、矩阵原生双向映射与既有生成绑定无漂移。
- 静态路由：SDK Facade 由 Registry 自动生成；Host `cookieCapabilities` 增加 setMany→write；intentOperations 从 Registry 的真实手势标志派生；可信 UI 将 setMany 放入 Cookie 一次确认链；manifest / package 的现有 cookies / browser.cookies.write 声明满足新接口，不新增权限。
- 安全语义：所有 row schema 与 Store/Partition 在第一条副作用前检查；依次复用 installed 单条 set 的 ifAbsent/权限/安装身份/原生回读/unknown 栅栏。中途失权只返回不含 Cookie 元数据和值的部分计数/索引/错误码，不继续写。成功行与未知行明确区分。
- Leader 最新消费约定：`{url:target.url,cookies:[nativeInput 去 url]}`，完整 payload ≤11500 UTF-8 bytes、每批 ≤50 条；有效 Store/Partition 变化按原次序切批。按 `results[i].index===i` 与 saved/verified 检查，首个 false 或 unknown 停止后续批次。失败 schema/scope 抛错同样停止，不能重试未知效果。
- 没有启动 CFT / dev / build；没有改工具/examples、Cookie 原生 Driver、Native driver、dist 或其他 Agent 文件。

最终安全 review 修正：批量回执 code 改为 Schema 与 Host 共用的 16 项严格已知枚举。任意凭据形似 `E_SECRET_TOKEN_0123456789`、未知 code、数字、缺失 code 和 message 不透传，统一保守映射 `E_OUTCOME_UNKNOWN`。新增回归确实从第二行原生写入前的 authorizer 异常注入，能捕捉先前正则透传漏洞。

冻结检查输出（最终源码）：
```text
Node targeted: tests 133 / pass 133 / fail 0 / skipped 0
node --check: all 5 changed runtime JS PASS
git diff --check: PASS
generate-browser-bindings --check-developer: ok=true publicCount=74 nativeChrome=NOT_TESTED
generate-browser-bindings --check: ok=true approved=76 direct=3 scoped=3 nativeChrome=NOT_TESTED
check-browser-sdk-interface-matrix: ok=true sourceFiles=191 nativeDiscovered=1830 approved=76 callableRegistry=74
```

范围核对：开始写入前这 15 个 tracked 路径 diff 为空，收尾逐项 diff 只有本 executor 的 setMany、严格 code 枚举、定向测试、必要计数/矩阵和生成文档改动；没有观察到其他 Agent 对这些路径的变更。第 16 个路径为本工作记录；命中 `.gitignore:71 /docs/framework/workstreams/**`，快照须显式读取该文件，不能只依赖 git diff/status。其余 dirty 路径不属于本 executor。冻结后停止写入以下文件，供 leader 制作 HEAD + 明确文件快照；产品构建只需下列前 5 个 runtime 源码覆盖，工具正式包由 leader 单独纳入。


冻结基准 HEAD：`e81be4c8464e0d11379564f5ab2664d98f1ced28`。

完整改动清单及 SHA-256（前 15 个文件冻结；本记录自身为第 16 个文件，避免自引用 hash）：

```text
40109a5175a81989d62dd6b0c7f4f71fa77acb683473f6bfc2592be96d7ab7a9  src/framework/sdk/browser-contract.js
9d4c61e300fdb40127548a7e74d7543b8fee6ab2dee704041c417b14e9e7ebd8  src/framework/sdk/browser-schemas.js
30bb1c3f7bcdea2577c5ad8dffd4dd6d5276a04bf5793842858026063cea8f8b  src/platform/chrome/browser-cookie-host.js
ae68d469cf0546abd89e8cbc94bf62b05f38d4c11994da98da248e48dc27a72b  src/platform/chrome/context-menus.js
70b03419dfd2f2f3c6ad77ba001cbf285538b6ec9df24607428420793ce60b2b  src/ui/sidebar-tools.js
4666aeea682a5bf875165aa3a8dc6967484893da3e0cdf1ab41aed3f8f3d4a69  tests/environment/browser-sdk-freeze.test.mjs
df30892d6942a920f676974d108bbb2ddededbf6879c4027422f28d2cbeccf62  tests/environment/browser-sdk-r7-trusted-cookies.test.mjs
53e6515a7740e3f061fd9816f387c2725a959abd55eb5779d28aa3887d102692  tests/environment/browser-sdk-r9-installed-cookies.test.mjs
427c5f461b398caff1439e42bf7cf9fb81b623e6c04cc9a3cbdb6a681eb29735  tests/environment/browser-sdk-r9-installed-host.test.mjs
3f386c90a10f8784ac33dd06deb3d69e4e918922d69e10e2fa4c01c0fd5caaf4  tests/environment/browser-sdk-r11-generated-catalog.test.mjs
a45e4a3799f2c657f72491b21fdf8292ac7e895b544a6814aabd68496807933f  docs/api/browser-sdk-execution-manual.zh-CN.md
aeeaaac742b55ebaada1475620688b281fc69761e381067dbe6681fd475b6242  docs/api/browser-sdk-interface-matrix.json
68e00c5d9353331b3c0bc0a600389fd8dce4cef6b1f587d120a3dfe3d46d3cd4  docs/api/browser-sdk-binding-catalog.generated.json
329592b529042d5e661de614600a02869001f8e23e49f51caccc48032522d7bd  docs/api/browser-sdk.developer.generated.d.ts
6de5ccd61f707d42078f832cd5f937f16a223e6ee7d6cf8e7f4879c1de28c2a7  docs/api/browser-sdk.developer.generated.md
[workstream-self]  docs/framework/workstreams/cookie-import-sdk-batch-20261017.md
```

## Leader开发环境回写（2026-10-17）

冻结15文件收尾前逐项同SHA，复用133项SDK及134项联测，不重跑。正式2.0.20在dist/development的真实Cookie Editor→公开cookies.setMany→既有Host/单条set/readback链完成样本file/paste：各25有效、5过期，各一次动态批次Host确认；原生身份、值、属性验证及网站后续自主变化计数见主工作记录。import-invalid同框修改后1条原生写入/回读也PASS。该证据仅开发CFT155，不宣称production或全框架原生PASS。工具包原SHA和版本不变。

随后Git集成如引入远端其他工具对src/ui/sidebar-tools.js的独立改动，仅合并不冲突的既有setMany确认两处接线；原冻结hash保留为测试时身份，不伪造当前完整文件hash相同。其他SDK冻结输入继续逐项核对；无关远端变化不触发全量回归。
