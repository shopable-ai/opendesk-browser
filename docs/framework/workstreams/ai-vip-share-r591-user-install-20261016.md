# AI VIP Share R5.9.1 用户实际安装阻断

负责人：Codex，本对话（2026-10-16，Asia/Shanghai）。状态：调查实际 Chrome 导入失败；核心功能仍在开发验证阶段。

## 写入与资源

- 仅 main，开始 HEAD `cc763a30ee146be71bd230e98fe642b3ce3b5069`。保留其他任务的暂存、冲突和 preview 三项改动；Git 索引操作必须等待现有冲突负责人交接，不替他人解决或提交。
- 当前明确写入：本记录。必要时最小修改 `src/ui/sidebar-tools/package.js` / 对应导入消费者与定向测试，确定具体缺陷后先追加精确路径；正式工具源码若需修复，沿用现有版本升级与唯一打包器晋升。
- 只读副任务：Mill 检查正式工具核心源码及 R5/R5.1/R5.9 测试覆盖，不运行浏览器、构建或 Git 写操作。
- 日常 Chrome：`/Users/shopme/Applications/Google Chrome.app`，观察到扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。实际加载目录、Side Panel 文档、edition 与运行 revision 待读回，不以旧独立 CFT 证据代替。
- 现有 `npm run dev` PID 55545 / node writer 55566，127.0.0.1:43119/43120 LISTEN。不另起 writer，不覆盖 `dist/development`，不修改 Native 配对，不重放未知事务。
- 浏览器资源：只操作用户日常 Chrome 的 AI VIP Share 导入/打开链；其他 CFT/Profile 和其他任务 DevTools 保留。

## 首个缺口与通过条件

用户实际导入正式 v2 / 1.3.1 包报“工具能力声明超出当前支持范围”。先取得实际文件身份、运行校验器拒绝能力、执行资源及 Side Panel / SW / 磁盘关系。通过条件为原链选择文件、版本/能力审阅、确认安装、主动打开、返回列表、重新打开；保留包能力和严格校验。Node、日常 Chrome、真实 Provider、Chrome 副作用、Native、production 分开记录。

R5.9 已有组件结果仅在相关输入不变时复用；新包必须经候选→定向门禁→`--promote-from`→`--check-project`。四项服务端点、目录、合法代理 profile 和安装 ticket 尚缺，不构造假成功。

## 日常 Chrome 原安装链结果

**USER_PROFILE_INSTALL_PASS（仅本包、本次链路）。历史能力拒绝当前未复现，根因仍未证实；不是修复了一个已定位的校验器缺陷。** 本轮没有修改产品源码、能力、版本或包字节，没有重新打包、重装扩展、强制刷新、写入安装记录或改 Native 配对。

- 原生日常 Chrome 进程 PID 75495，路径 `/Users/shopme/Applications/Google Chrome.app`。`Default/Secure Preferences` 的该扩展记录为 unpacked `location:4`，实际目录 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`；扩展详情页也显示同一加载来源。edition 名称为 `OpenDesk Browser Developer`，版本 0.1.0，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。
- **原文档**为 `/ui/tool.html?hostInstanceId=432dcf0d-c437-413c-aa0b-04030e9023ad`，真实 `SIDE_PANEL` documentId `54314CA1760DE53B51DA1B46C643932C`。在该文档原导入回调上设置诊断断点，由原生文件选择器明确选择工具根正式 JSON。读取实际 File 的 SHA-256 为 `2b7a74b4c2596a910cd4dd892d3f7aac5e4af21ea45bd8dac1730a885c46892e`，56902 bytes；不是凭文件名推断。
- 在执行中的编译校验器 `Je` 调用帧（Sources 显示 `sidebar-tool-host.js`）直接读回：v2 / ai-vip-share / 1.3.1，四项能力为 storage.local、network、browser.tabs、browser.proxy.managed，`rejected:[]`。没有删能力、改格式或修改校验结果。恢复执行后，**同一原文档**显示 v1.3.1 和四项能力审阅；原生点击“确认安装”后显示“已安装「AI VIP Share」。点击‘打开’启动工具。”，列表出现工具，安装没有自动打开。
- 再原生主动打开，返回工具列表，再重新打开；均成功。实际安装存储由原安装器产生，规范序列化的 SHA 与原文件一致。安装 HTML SHA `d4cfcb1fbf308c9fe1ef5f43765c228244c69284ac23b2696c5503609c931200`，CSS `bbc8a7dbd106ef0af596f934522f3a6c0859e235465230fe67199c32a95c71cc`，JS `6ed83422ef33c51c01c5fd0e7cd76558a12abb4921a7631972932979cd96d5df`。
- 另开过**同一 Default Profile、同一 ID**的检查窗口，SIDE_PANEL hostInstanceId `a415ee80-801d-4f5f-9fda-97eaea6b0bc0` / documentId `9C235621C750141DAAECBE6A2BE820ED`。它也可审阅相同包，没有在该窗口重复安装。没有启动或借用其他 CFT。两文档都接受当前包，因此不能把历史错误确定归因于某一个旧页面或缓存。

## 开发服务与构建漂移

模式仍为**持续开发，但安全更新待释放**。原 watcher 55545 / 55566 存活且监听 43119/43120。原页面 output、后台 `storage.session` 开发基线均报告 revision `03ce689c843218bf07998be9ac9ee2287301e73c660c9dfd3dab3f1ff964a517`；状态原文为“源码已编译；任务、原生请求或未知结果仍未释放，自动刷新已延后。”基线 host hash `b6784e8337ef5c6cfdecc863a05cb17c900ea2c22c83adade3585c05f8d62df5`、shell hash `9136e326b0067cc9e6b2692075ed88859402fc49ec38f7ed598b107b2697223d`。

磁盘观测时 revision 为 `04c954e6dd71bd2dfcb44c2de9d98a2934b5efa1a1c3abb19f5455c2788a47ee`，host hash `1ae7207744110658cf7c9714a9c4650782e7633b66fe73ff9229a1f21834b019`、shell hash `1b56db37259d1aa5b24e3237028a40aa9c23ebaf88b03b525e6c7dd38413829f`。磁盘与后台 applied 基线不一致是**直接证据**；applied 基线不是每个活文档脚本字节的独立测量，不能据此断言哪个旧构建曾拒绝某项能力。没有释放未知事务、伪造退休或绕过安全更新栅栏。

## 核心路径真实结果与复用

- 原文档主动打开及重开均显示“服务未配置”“账号尚未绑定”，明确会员/权益/历史不可验证；兑换输入和提交、商品入口与代理启用禁用；激活链接文案明确“当前尚未接入”。没有测试账号、假权益、模拟服务或安装状态。
- 原生点击“刷新状态”，通过正式工具的现有 Managed Proxy SDK 事件路径返回“已停止”。独立只读 Chrome 回读为 `permission:true`、`control:controllable_by_this_extension`、`mode:system`。此时只显示“启用代理”主按钮且因正式端点与会员服务缺失禁用；没有点击或执行真实 START/STOP 副作用，也未改代理配置。
- 工具恢复区未显示存储故障或待核对事务；本次仅覆盖空记录初始化与重开，不等于非空交易恢复、写入失败或账号切换的真实 Provider 验收。
- `opendesk browser doctor` 当前返回 `connected:true`、`local.extensionId` 和响应 extensionId 均为该真实 ID、`nativeConnected:true`。Native manifest 的 allowed_origins 也完全匹配。此前试探 `doctor --help` 返回 E_SCHEMA；合法无附加参数的 doctor 成功。此项只证明当前配对连接，不能提升为工具 Native 业务验收。
- 唯一打包器 `--check-project` 新鲜返回 `PROJECT_PACKAGE_MATCH`，包身份及 SHA 不变。正式工具与 R5/R5.1/R5.9 测试源码无本轮修改，已有组件门禁按 R5.9 原始输入复用，不重跑同一批 VM 测试冒充新原生结果。只读副任务未发现高置信核心源码缺陷。
- 诊断通过原生 UI/AX、DevTools 只读断点和存储/Chrome 回读完成，没有 DOM 赋值、synthetic events 或安装存储写入。已移除诊断函数断点并恢复 JavaScript source maps；调试表达式中曾出现作用域/换行语法错误，这些是诊断错误，不登记为工具业务错误，也不宣称全量 Console/网络无错误捕获。

仍为 `PROVIDER_BLOCKED`、`PROXY_PROFILE_BLOCKED`、`INSTALL_CONTINUATION_BLOCKED`；真实领取/取消/未知事务/账号切换、商品实际外链、真实代理 START 在途 STOP 及所有权交错未测。Native 业务、production/F3/ZIP 未测。工具仍属于开发验证阶段。

## Git 与当前交付

本轮授权允许提交和安全推送。本地并行集成期间 HEAD 已变为 `9ac2999f33e67612f4d5338fa58537ca7d5b2209`，重新 fetch 的 origin/main 为 `cf81e07d9f0a69f367b33490ad038f496ef23ae7`。其他任务正在处理暂存区冲突，涉及 prompt-shortcuts 源码、打包来源脚本及其测试；不代为解决、stash、提交或覆盖。只对本记录和本机忽略的观察证据写入，待共享 Git 写入资源可安全使用后仅提交本任务路径。既有正式源码提交 `32200a8f5cea71e8f00c6b99af5063a9160e70a3` 已在当前 main 祖先中；提交/推送结果以最后核对为准。

后续核对：其他负责人已处理冲突，unmerged 与 staged 均为空，无正在执行的 Git 写入进程；其余文件保留为原工作区差异。提交本记录前再次检查完整暂存区与 HEAD，发生竞争则中止本事务，不撤销他人暂存。当前本轮只新增本记录；正式代码与包仍使用 `32200a8f5` 的不变字节。

本机观察转录与源码绑定：`artifacts/ai-vip-share-r591-user-install/observations.json`，SHA-256 `bd9ef5a93965ce91399c8a33f370374aedb649dc4496a0671b4d6cec9fae0a38`。这是 CUA 原生 AX / DevTools 读回的**转录索引**，不是自动化原生验收回执；没有截图或模拟业务数据。该文件依仓库规则留在忽略的 artifacts，不批量提交快照。

最后 fetch 后 origin/main 为 `d5a110ba4cad66470b10c0496edc8ad60f9462b2`，本地提交前领先 3 / 落后 **17**，并非只有最新标题的一项修改。安全合并预检发现远端自共同祖先后有多项 prompt-shortcuts 文件，且与当前其他任务未提交路径重叠，因此在执行 merge 前中止（仅 Python 断言失败，未修改 Git 状态）。不把该阻塞扩大为源码停工，不 stash 或覆盖这些工作。本轮证据可独立本地提交；普通 push 若被 non-fast-forward 拒绝则保留提交，交由当前并行集成负责人处理重叠文件后同步，不强推。
