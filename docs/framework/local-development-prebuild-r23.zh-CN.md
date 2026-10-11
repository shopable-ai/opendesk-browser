# R23 本地自动准备与内容缓存

日期：2026-10-11。实施在 Browser `main`，Go 仓库只读。日常入口仍是 [R17 目录 CLI](local-directory-cli-r17.zh-CN.md) 和已有 Sidebar / `opendesk.dev.*`。本轮没有发布 npm、推送远端、覆盖共享 dist 或全局 Native 安装。

**已实施自动准备、内容复核缓存、合并高频保存和显式运行；十项 ≥95 的整体门槛尚未通过。** 原始证据与候选身份见 [工作记录](workstreams/local-dev-prebuild-r23.md) 和 [证据清单](workstreams/r23-evidence-manifest.json)。组件、定向 Native、正式 F3 与 ZIP 安装属于不同证据等级；本轮不升级历史验收等级。

## 日常使用

首次安装或更新组件时，在仓库根目录执行下面的现有打包命令。先有已配对的 OpenDesk Go Native Host 和包含当前代码的扩展；确认当前安装归属后使用对应实例，不覆盖其他 Chrome Profile。Node ≥22.12。

```sh
npm ci --ignore-scripts
node scripts/pack-opendesk-dev.mjs
npm install -g .runtime/r17-dev-package/shopable-opendesk-dev-0.1.0-r17.1.tgz
opendesk-dev --register-go
opendesk-dev --version
```

`--register-go` 注册本机已安装工具，不发布包。真实 Go 小写字段、旧大写字段和已有 `OPENDESK_NATIVE_INSTANCE` 都经过私有文件/所有者校验；互相冲突的字段会拒绝。已有 Go/扩展安装及更新方式见 R17 指南。开发者首次构建扩展用 `npm run build:production`；日常编辑项目无需再构建扩展。

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller
opendesk browser dev .
# 或使用同一目录连接入口：opendesk-dev .
```

让连接命令保持运行。打开允许的网站和同窗口 Sidebar，在「开发」中手动开启「本地项目」、选择项目。编辑 JS/CSS/声明图片并保存，系统在后台准备；明确点击「运行本地项目」或让已配置的 Codex 调用现有 `opendesk.dev.run`。保存不会执行网页业务、安装任务或发布程序。Sidebar 每次重开仍默认直接编辑、Switch 关闭，项目选择与手动草稿继续保留。

演示页面启动前检查 43111 端口归属，空闲时：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

访问 `http://127.0.0.1:43111/demo-form.html`。MCP attach/status/run/result 的实际参数见 [MCP 文档](../api/mcp-local-development.zh-CN.md)。无需新增工具。首次 npm 项目仍需在其目录执行受信的 `npm ci --ignore-scripts`；HTTPS 依赖仍按现有显式批准、锁与离线完整性规则准备，后台准备不执行 npm 脚本或自动联网锁定。

## 已实施的生命周期

```text
授权且可运行的项目
  内容快照与输入验证
    默认400ms合并保存；连续作废逐步延长至1600ms
    每项目一个正在准备的任务、一个最新待处理目标
    Provider进程最多两个准备槽，显式请求优先、同类FIFO；连续四个显式排队入场后给等待后台一轮
  不可变准备产物
    发布前复核根目录身份、输入闭包、锁、依赖字节和Provider token
    最新源码失败时报告错误，不回退上次成功产物
  明确运行
    已就绪：复核当前内容后命中，不启动Webpack
    同版本准备中：提升已有排队任务并等待，不重复编译
    捕获不一致：明确未执行错误，不无限重建
    入场前再次核对Host、真实目标文档及权限
```

Source Revision 是 `inputHash/sourceRevision`，包含文件内容、项目配置、锁、声明资产、已消费 npm/HTTPS 内容及正/负解析探针、构建帮助代码与锁定工具版本身份。`artifactId` 结合输入版本和经典执行 JS 的 `sourceHash`；注释变化可能改变输入版本而不改变优化后执行字节。Run Admission 继续由原 Native/RunHost/USER_SCRIPT 负责，绑定真实 window/tab/frame/document、冻结执行字节及独立请求身份。目录 bindingId 不是网页授权。

执行开始后编辑只影响下一次有意运行。旧 run/result 的 revision、sourceHash、runId、resultId 保持冻结。`E_EFFECT_UNKNOWN` 继续只读恢复，不能换 requestId 自动重放。Stop 保持恰选一个执行选择器；丢 ACK、迟到 Provider、断连和撤权遵守原保守合同。

文件监听只提供提示。监控实际依赖文件及祖先目录，处理新增、删除、重命名与原子保存，排除 `.git/dist/.wxt/artifacts/coverage` 等输出；没有递归扫描全部 node_modules。默认两秒内容轮询补漏，显式 Run 总是重新读取并验证内容。拒绝符号链接与根目录身份变化。普通 Markdown/HTML Workspace 不自动构建。连接退出、撤销与断连释放该 Provider 的 watcher、timer、缓存，排队任务不能继续编译或发布。

连续每50ms保存时保持合并，等静默后准备最新版本，以限制 CPU；这不承诺持续写入期间的准备延迟上限。用户 Run 则立即争取一致快照，仍变化时明确失败。不会无限排队中间版本。

## 缓存与构建边界

单文件保留 Direct Path，零编译。多文件继续使用既有 production Webpack、经典 JS 输出、现有受限内存文件系统、CSP、Native 消息及 USER_SCRIPT 体积合同。生产输出字节语义未改，未扩大限制。npm 项目原先绕过产物缓存的路径已移除；命中必须重新复核已消费依赖实际字节和负路径，修改 node_modules 但不改锁也不能误命中。锁变化仍重新做完整性检查。

缓存按授权 binding 隔离，最多八个允许路径，各保留最新产物及必要的稳定失败记录。语法构建失败只有在完整读取的输入仍一致时缓存；修复或未完整读入的 npm 错误不能命中。产物不原地修改；所有构建尝试（成功、失败、作废）都计数。

**没有实现持久 Webpack compiler 或模块级增量缓存。** `cache:false`、生产模式、创建/关闭 compiler 仍保留；本轮收益来自提前准备及经过内容复核的产物复用。工具身份包括相关帮助源码和 package 版本字节；同版本安装包的内部实现字节篡改并非全量检测，依赖既有可信、锁定安装合同。没有磁盘产物恢复或新权限来源。

## 分段测量及真实数据

设备 Apple M2 Max，12 CPU，96GiB RAM。Node 对照均为 v26.3.1，同一 production Webpack 5.111.1 配置；基线使用初始 `97637c12` Resolver 并仅添加计时，优化使用本轮 Resolver。每组4次新 Resolver、12次未改源码命中、4次改源码。cold 是新 Resolver、同一 Node 进程，不等于每次新进程冷启动。p95 是小样本经验分位，不能推广为生产 SLA。

下表单位 ms，缓存列为 p50/p95；优化后的每组12次命中新增编译均为0。

| 项目 | 实际 JS 输入规模 / Webpack统计模块 | 基线命中 | 本轮命中 | 修改后本轮总准备 p50/p95 |
| --- | --- | --- | --- | --- |
| 单文件 | 1 / Direct无Webpack | 0.31 / 0.94 | 2.60 / 3.11 | 2.74 / 3.30 |
| 两文件 Controller | 2 / 优化分组1 | 0.82 / 0.99 | 3.18 / 4.30 | 14.05 / 16.04 |
| 十二文件 Controller | 12 / 优化分组1 | 2.34 / 4.63 | 5.01 / 6.81 | 19.52 / 20.65 |
| local-controller | 2 / 2 | 0.71 / 2.18 | 2.78 / 4.48 | 13.37 / 14.70 |
| Page CSS/图片/UI | 3 JS另加声明资产 / 3 | 1.75 / 2.64 | 4.09 / 5.08 | 49.93 / 51.49 |
| page-npm-lodash | 闭包 / 17 | 31.77 / 36.40，12次编译 | 7.66 / 9.88，0次编译 | 38.42 / 41.32 |

新增完整身份复核使原本已缓存的轻量项目慢约数毫秒，仍低于100ms目标；修改后的整体准备没有普遍加速，不能宣称编译器增量优化完成。npm 命中 p95 从36.40到9.88ms，约降低73%。原始分段 timing、CPU、内存及模块统计保留在 baseline/optimized JSON，不以总准备耗时代替 Webpack 耗时。基线为 `baseline-verified.json`，表内数据为FIFO修复后的 `optimized-priority-fifo.json`；最后取消/后台配额/错误代际小修复由90项回归及当前Native验证，不重新编造六组数据。此前 `optimized-verified.json` 也保留，不改写旧记录。

真实受控 Mac CFT 155、既有 Native Messaging 与 MCP 连续10次明确运行：全部 prepared cache hit、0次新增编译。本地复核/获取 p95 **4.14ms**，Native admission p95 **26.40ms**，run到持久结果且released的端到端 p95 **194.03ms**。后者包括150ms结果轮询；Native admission含传输、Host入场和准备，不能称为纯线缆传输。FIFO调度候选的另一批10次实际运行p50/p95分别为本地4.44/13.74ms、Native admission18.38/56.75ms、端到端187.17/250.55ms，仍全部命中零编译。最后取消/配额/代际修复候选再测10次，p50/p95为本地4.45/5.18ms、Native admission20.22/26.94ms、端到端191.71/198.80ms，全部命中零编译。三批原始数据都保留，不选择性删除慢批。尚未把真实浏览器执行阶段与这些环节完全分离，P0七段测量合同未全部关闭。

30次真实保存合并一轮，最后通知到开始准备约 **400.47ms**，准备18.33ms，其中Webpack12.77ms；随后Run命中零编译。FIFO候选又测一批30次保存：401.56ms合并、44.18ms准备，其中Webpack34.98ms，后续同样零编译；最终生命周期候选30次保存为401.01ms合并、24.16ms准备/14.88msWebpack。十分钟每50ms持续写入，实际11658次保存、2次Webpack、0次业务执行，最终文件SHA与版本匹配。总CPU9.11秒，采样RSS约96.5–110.5MiB；该fixture结束后watcher/timer/queue/inflight均0。长测Node v24.16.0，不能混作Node26性能对照；旧长测的通知计时被轮询覆盖，已用定向断言修复，不能引用其旧1995ms为当前监听延迟。

## 验证与尚未关闭事项

- 组件：隔离依赖和构建目录953 PASS、1 SKIP；跳过的是依赖全局安装名称的环境测试，另有实际受控Native证据，不把SKIP改写成PASS。调度/CLI回归57/57，最后加入取消/公平性/代际错误修复的相关核心回归90/90。
- production/development构建及包字节检查均通过；SW320211/327680字节，未扩大上限。独立安装真实CLI tarball、Resolver准备及命中通过，实际Go安装配置只读解析通过；没有冒充完整Go目录租约验收。
- 真实Sidebar Controller/Page、再次运行清理、切换/重开、草稿保留、新文档、断MCP后的UI停止通过。实际Codex CLI完成四次明确执行、读持久结果及错误修复；受控CFT证据独立列出。
- `chrome-complete` 29个功能用例PASS，但整轮最终网络观察器捕获短暂iframe `CDP disconnected`，总体 **FAIL**，未放宽观察合同或删失败。HTTPS正例改用实际CDN静态模块 `_baseSum.js`；旧包含动态Function的依赖继续安全拒绝，保留原始FAIL。
- 单文件与撤权/重连/导航定向Native：8项全部通过，`PASS_R101_NATIVE_LIFECYCLE_TARGETED`。真实移除nativeMessaging后可信设置恢复、所属Native Host进程断开后只读恢复、Controller导航和外部导航旧文档拒绝均有回执；资源释放true。最后Node生命周期修复后又做5项相关定向验证（单文件、10次prepared、30保存、外部导航），全部通过；它们不覆盖完整轮次的观察器FAIL。
- Go列表接口当前会丢弃Node的 `preparation`，所以Go→Sidebar实时「合并/更新/错误」细状态闭环 **BLOCKED**；本轮按约束不改Go。Node/MCP的状态可读，Sidebar有上次读取版本、缓存与耗时诊断，但不冒充实时最新。
- 会话累计256个admission上限仍按原合同安全拒绝，没有不安全地清历史以重用requestId。长期会话容量策略、完整分段尾延迟采样、同版本工具内部字节全量身份和持久增量compiler仍未完成。
- 独立最终F3、正式账本关闭及与dist一致的ZIP安装本轮未完成。没有整体PASS、发布或安装交付声明。

## 独立评分

由独立只读Codex复核当前源码及证据摘要；其未自行核验所有原始回执，评分只在列明的证据与合同范围内有效，不计算平均分。Claude因认证401、Gemini因缺少认证无法参与，原始失败保留。设计分与实施分分开，目标每项≥95。

| 维度 | 设计 | 实施 | 达标 | 证据与剩余缺陷 |
| --- | ---: | ---: | --- | --- |
| 用户操作便捷性 | 93 | 92 | 否 | 保存自动准备、Sidebar运行；Go实时状态缺口 |
| 本地Codex体验 | 94 | 93 | 否 | 实际CLI四次运行与修复；256次会话容量 |
| 构建与运行性能 | 94 | 94 | 否 | npm零编译、真实10次；小样本/分段不足 |
| AI高频稳定性 | 94 | 94 | 否 | 十分钟、两槽、资源释放；长期会话容量及已测规模 |
| 缓存正确性及版本一致性 | 95 | 95 | 有条件 | 内容/锁/探针/冻结结果；限可信锁定工具安装 |
| Native与权限安全 | 95 | 94 | 否 | 真身份、丢ACK不重放、Stop互斥；完整最终候选生命周期证据待核 |
| Controller/Page/npm/HTTPS兼容 | 95 | 95 | 有条件 | 已测静态依赖、CSS/PNG/UI清理；动态构造器不支持 |
| 可维护性与资源管理 | 94 | 94 | 否 | 编译尝试计数/退出归属；更大项目未证明 |
| UI与诊断 | 90 | 84 | 否 | 防重复轮询/高级诊断；Go实时状态未传递 |
| 测试与真实Chrome完整度 | 95 | 94 | 否 | 组件、CFT、实际CLI；观察器FAIL及F3/ZIP缺口 |

最后独立delta评审已确认显式排队升优先级及FIFO修复。随后补充后台每四次显式入场一轮、关闭主动撤队和旧代错误不覆盖新代，最终90项核心回归通过；这些是评分后的定向修复，没有自行提高独立分数。独立原文见[评审](evidence/local-dev-prebuild-r23/independent-review/ask-codex-r23-delta-review.md)，其“核心96项”为先前摘要，不替代最终90项记录。最终原始证据补充和冻结身份见工作记录，分数不能替代正式验收。

## 可复现检查

以下命令已实际使用；输出必须使用新路径，不覆盖旧证据。执行前按testing-guide核查他人dist、端口、Chrome与Native实例占用。本轮构建在临时独立文件系统快照完成，根目录共享dist保持不动。

```sh
npm run check
node --test tests/environment/local-dev.test.mjs tests/environment/local-dev-preparation.test.mjs tests/environment/r17-dev-cli.test.mjs
node tests/framework/local-dev-prebuild-performance.mjs /tmp/r23-performance-new.json
node tests/framework/local-dev-prebuild-sustained.mjs /tmp/r23-soak-new.json 600000
node scripts/pack-opendesk-dev.mjs
node tests/framework/local-dev-prebuild-packaged.mjs .runtime/r17-dev-package/shopable-opendesk-dev-0.1.0-r17.1.tgz /tmp/r23-installed-new.json
npm run build:production
npm run build:development
```

真实CFT命令、独立实例、原始回执及每次失败的观察方法变化保存在证据清单及工作记录。只复制匹配当前安装/Profile和冻结package receipt的命令，不抢占他人共享安装；本轮CLI默认安装步骤仅作用户指引，没有执行到用户的全局安装。
