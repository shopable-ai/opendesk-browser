# OpenDesk Browser R10.1 开发环境续接

请在真实本地 Mac 仓库继续实施、修复、验证并提交。默认中文，直接执行已授权工作，不要停在规划。以下是上一对话交接，先核对现状；不要重新实施已合并功能或重复已有效的测试。

## 用户最新范围
当前是开发环境，暂不考虑 ZIP、生产安装、release/publish。继续完成普通 JavaScript、npm + HTTPS ESM、本地 Codex/MCP → Native → RunHost、真实 Mac Chrome 开发扩展验收。保留既有生产/ZIP原始证据，后续阶段再验收；不能把暂缓项填成 PASS，也不能据此宣称最终 F3 已关闭。

## 仓库、分支与接续方式
- 仓库：shopable-ai/opendesk-browser。
- 主目录：/Users/shopme/Documents/workspace/opendesk-browser。该目录有其他工作和本地提交，禁止覆盖、重置或直接写 main。
- 本对话独立工作树：/Users/shopme/.codex/worktrees/r101-audit-01a120eb/opendesk-browser
- 分支：agent/r101-audit-01a120eb。
- 最新实施/驱动提交：5c3eb119c7b396e70f87ee85074ebde92926b3fc。之后的交接文档提交通过 git log 核对。
- 2026-10-09交接时重新 git fetch origin 后，origin/main 为 44b7c4b63e4613b68f4e1d9c62797b6ec495a89f；独立分支已通过 362e3df 合并该 main。
- 主目录本地 main 当时为 f462df264afd5b1b8d32101fb36af1d63c98c8cd，和远端不同，须保留并核对，不擅自同步覆盖。
- PR #37、#38、#45 已合并。PR45 head 77f424d6326cf210f55b5468c1793cdb8aadc23d，merge 为上面的44b7c4。
- 本分支后续驱动/MCP说明修复尚未 push、尚未创建新 PR。不要当作已经合入 main。
- 上一对话已结束测试写入；development-02 已自然失败结束并释放资源，原驱动PID9913与受控Chrome PID9925已不存在。接续前仍须实际检查进程、端口、Native实例和工作树占用。
- 优先复用交接工作树及证据；若跨聊天工作树管理不允许附着，或原工作树出现其他写入者，在自己的 agent/<任务>-<标识> 工作树从本分支接续。禁止改写其他 Agent 分支。
- 不删除尚未合并的 audit/maps/closure 等分支和工作树。

## 先读的文件
- AGENTS.md
- docs/framework/testing-guide.md
- docs/framework/parallel-development.md
- docs/framework/prompts/goal-r10-1-local-codex-https-esm-acceptance.md
- docs/framework/workstreams/r101-audit-01a120eb.json
- 本交接文件 docs/framework/prompts/continue-r101-development-01a120eb.md
- .agents/skills/opendesk-program-publish/SKILL.md；首次使用时告知用户。
- CFT隔离/钥匙串需要时读 /Users/shopme/.codex/skills/chrome-testing-keychain/SKILL.md。
证据位于交接工作树 evidence/r101-audit-01a120eb/，尚未跟踪，不能清理。失败日志、原始NetLog、Codex日志都要保留；不得把含无关桌面内容、授权信息的原始文件直接推到公开PR。

## 已完成：复用，不再开发第三套
1. R10 P0、PR37本地目录/MCP、PR38 npm 已复用并合并。现有共享构建器、Native Host、JS Runtime是唯一实现，不新增平行实现。
2. HTTPS安全修复：TLS rejectUnauthorized、hostname/peer校验、全DNS答案公网验证与IP固定、DNS TCP回退复用同一答案、缓存/锁/目录身份检查、字节限制/FIFO/符号链接防护、并发锁更新，以及Mac /var到/private/var规范化，已有回归。
3. 必须保留安全边界：Node没有可移植openat/renameat CAS；观察inode/目录替换与O_NOFOLLOW不构成对恶意同UID进程的完整文件系统沙箱。目录须可信。模拟攻击不访问真实云Metadata或敏感内网。
4. tests/environment/r101-source-map.test.mjs 已验证锁定npm + HTTPS相对传递依赖、re-export、查询参数、原始source/content/行列映射。无需重新写打包器。
5. npm fixture安装使用正确cwd；npm ci --prefix曾触发Arborist EUSAGE，已修复。无新增依赖。
6. Native实例 r101-eb 隔离个人/default实例。中文Native权限弹窗标题/正文驱动、受控浏览器唯一进程名已处理。
7. 浏览器启动期不暂停service_worker autoattach，避免扩展初始化死锁；握手后接入真实SW网络观察。浏览器全程NetLog + Page/Sidebar/Worker观察已接入。
8. 打开前和关闭后实际verifyPackage，记录完整文件指纹及packageHash，检查包字节未变；不能仅凭manifest哈希声称身份一致。
9. 关闭浏览器等待6秒再有界降级，避免600ms杀进程导致NetLog截断；native-16失败保留。
10. 实际Codex CLI配置已修复：仅禁用用户配置的其他MCP名，不给插件派生服务器写无效transport；不改全局配置、不打印凭证。允许CLI仅编辑授权src/extract.js，浏览器运行只走现有MCP。
11. 本地目录attach只传path，目录package继承runtime/origin；单文件选项不能改变已授权目录scope。native-agent/local-dev/mcp.mjs说明已修复。
12. 真实Controller Stop、deadline、lost-ACK只读恢复无重放已有定向Native证据。

## 可复用证据：严格分级
Node：
- merged-check.log：npm run check通过（200文件）。
- merged-tests.tap：82/82 PASS。
- mcp-description-tests.tap：33/33 PASS。
- integrated.tap：83/83 PASS；security-p0.tap：47/47 PASS。
- source map/resolver相关34/34 PASS（从证据目录核对对应文件）。
- 这些是Node/组件证据，不提升为真实Chrome/F3。
CI：
- ci-pr45.json保存已合并PR45真实head检查；9个验证job成功。
- live-https-esm-smoke为SKIPPED；delete-merged-branches是维护job。都不能补算为验证PASS。
- 本分支后续提交没有新PR CI，提交前按实际差异跑必要检查。
Mac Native/Chrome：
- CFT真实版本156.0.8078.4。
- 独立CFT路径：/tmp/opendesk-r101-eb/Google Chrome for Testing.app/Contents/MacOS/OpenDeskR101EB
- bundle id com.opendesk.r101.eb.chrome；显示名OpenDesk R101 EB。
- Native实例OPENDESK_NATIVE_INSTANCE=r101-eb。
- 开发扩展ID ggobopmahiojlajjhodmkmpgddlkgeei。
- 开发包hash 4f6f3005dfde10f0d85d89e1d45a96e66ffcf6daf954720c02f8edb11e1363fa。
- 生产包旧证据hash f1699d79eebf058eb0dc97115724bf97b187d3cb24be1984a0fc2432aa941342，保留但当前不再做生产/ZIP验收。
- development-01：24项PASS，但整轮FAIL，原生#local-project-select选择失败。
- development-02：24项PASS，但整轮FAIL，等待真实外部原生#local-project-mode选择超时；当时尚未执行CUA选择。不能写成CUA或自动下拉已成功。
- 两轮开发测试都真实加载开发MV3扩展；packageBytesUnchanged=true、resourcesReleased=true、完整NetLog remoteCode=0。个别有效用例可复用，不得把整轮FAIL升成PASS。
- native-14：真实Codex用例成功，但整轮FAIL于后续原生菜单。
- native-15：27项PASS，但整轮FAIL于最终切回手工草稿选择。
- native-01至native-16和development-01/02全部失败材料保留。只有输入身份/代码/观察方法明确变化才重试同一失败。

## 已存在的真实运行身份
development-02/acceptance.json：
共同目标documentId：C946ED62071C8B0C27E175B54D631712。
- HTTPS：42；runId 7329ae4d-95bf-4523-b385-26da5df5c968；
  resultId 185386b0-ef57-472b-986a-d33293ace70c；
  sourceHash 3046b05a51c0f509b9d74deb6b6628a5156d46e3a2b681732e85b402aa9b1280。
- 编辑后：43；runId 4a31aae5-291d-4134-85ca-fd0f7c5e5f12；
  sourceHash 4c0f21d1fdbc11d264abc8eae72c547ee70cddc3487406d0aef4c6b6896c381e；旧42回执保持原hash。
- npm + HTTPS mixed：namespace/npmDefault/npmNamed/npmNamespace/reExport/value六项均42；
  runId e4a3df86-634e-407d-8a40-db6545dccb9f；
  resultId 25c8c1fe-ac66-4442-b5f1-82767133ca0c；
  sourceHash 2d3a27e2fb43a56d9d86ab4a3cf45c5f1d975a837d949c909284a408169e67c5。
- 普通async function main(){return document.title;}在Sidebar返回OpenDesk Browser · Browser Test Lab；
  sourceHash 5b27b24c2f76789ac0cd4cbc7bede0018c5e63f935b2cacd3ff7c5a24e5d87ec。
  该入口是one-shot Page preview，没有Controller runId/resultId，禁止补造。
- Controller Stop：E_CANCELLED，deadline：E_TIMEOUT，retirement released；具体真实IDs见同一acceptance.json。

native-14/codex-receipts.json + codex-events.jsonl + codex-stderr.log：
实际codex-cli0.144.5通过stdio MCP，编辑readSummary(page)版本101→102并真实运行两次。
共同documentId：05B98DA99D87EF5D477BCE3548C09167。
101：runId 929ae9a8-ce99-4544-bd7e-18d5d1d2a4a3；
resultId e908d338-1d22-4383-be9a-40f582e85cfb；
sourceHash a19376da424a1bca8a6a9a3ef051888ab1e3b7f5331657edd8867960fd601ce3。
102：runId 0b4ebb21-4a6b-41da-951f-25162299b3f3；
resultId bb02005e-07e0-4bf3-89f4-734414720e04；
sourceHash 1540247d4758df359e6a293a3e38f4da22b35612346cf21fae5799ad729afb6c。
两个结果都有真实标题和version，released；新版本后读取旧结果仍101及原hash。
证明来自raw item.completed mcp_tool_call，不来自模型最终文字。该证据为旧生产包；能复用不受包变化影响的链路证据，不能声称已在开发包重做实际Codex。

## 接下来真正需要做
1. 优先解决/验证真实Mac Sidebar原生下拉菜单输入，范围是现有tests/framework/local-dev-native-acceptance.mjs驱动。不要为测试驱动问题盲改产品。
   - 需要的实际选择顺序：#local-project-mode→本地项目(index1)，#local-project-select→project(index1)，重开/导航后→page-project(index2)，最终mode→手工草稿(index0)。
   - 旧AS全局Home定位、前台焦点检查、AXMenu/Arrow差值方案仍不稳定，不能把提交过修复等同通过。
   - 可启用OPENDESK_DEV_EXTERNAL_SELECT=1，用CUA控制已确认PID活着的专属CFT、真实AX/键鼠选择；不要让用户人工代办。
   - 每次等待120秒，观察events.jsonl中的sidebar.awaiting-external-select；只操作对应原生菜单。CUA辅助成功要明确其证据性质；自动驱动仍需单独如实报告。
   - CUA重置或上下文压缩后先rewriteDocumentation，索引每次刷新。禁止DOM赋值、synthetic events或假Native ACK。
2. 复用已PASS且输入未变的JS/npm/HTTPS/离线/SourceMap/Stop/deadline/lostACK证据，集中补菜单后的Sidebar绑定、重开、Page项目、断连恢复。
3. 核对并补真正缺失的开发验收：真实Native权限撤销与重新授权、Native端口断连恢复、Controller运行中导航、真实迟到结果/旧身份拦截。MCP provider断连、组件fence、冻结旧结果分别是不同证据，不能互相替代。
   - 当前manifest部分权限为required；不要把不可remove的origins当成撤权成功。先检查现有optional nativeMessaging与service worker onRemoved/fence合同，复用真实路径。
   - 使用demo-form实际控件与受控真实输入。未知effect/丢ACK后只读查询，不盲重放。
4. 必要时仅补一次开发包上的真实Codex101→102验证。复用r101-codex-cli.mjs，不新建MCP/Runtime；真实证据已足够且包变化无关时先说明复用依据。
5. 执行差异影响范围内的检查，整理可公开的精简证据索引，按Lore提交自己的分支、push/创建PR并附着PR。main只能由获授权集成者串行合入，必要检查未过保留草稿，不强推。
6. 更新独立workstream，保留失败、NOT_TESTED及旧账本身份。四份历史tracked build/pack receipt已恢复；本次原件保存在evidence/r101-audit-01a120eb/handoff-build-receipts/及merged-*副本，禁止重写旧receipt。

## 现有运行器与参数
复用：
- tests/framework/local-dev-native-acceptance.mjs
- tests/framework/r101-local-programs.mjs
- tests/framework/r101-controller-lifecycle.mjs
- tests/framework/r101-codex-cli.mjs
- tests/framework/native-chrome-consent.mjs

只有决定了受影响重试且资源空闲才运行：
OPENDESK_NATIVE_INSTANCE=r101-eb
OPENDESK_R101_ACCEPTANCE=1
OPENDESK_DEV_PACKAGE_DIR=dist/development
OPENDESK_DEV_BUILD_RECEIPT=evidence/r101-audit-01a120eb/merged-build-development.json
CHROME_FOR_TESTING_BIN="/tmp/opendesk-r101-eb/Google Chrome for Testing.app/Contents/MacOS/OpenDeskR101EB"
OPENDESK_DEV_EVIDENCE=evidence/r101-audit-01a120eb/<新的独立目录>
可选OPENDESK_DEV_EXTERNAL_SELECT=1、OPENDESK_R101_CODEX=1。
以/opt/homebrew/Cellar/node/26.3.1/bin/node启动运行器。
Node24的allow-net限制不能证明断网；离线重建必须使用实际ERR_ACCESS_DENIED网络探针、已锁缓存、相同sourceHash。不能只设置代理变量就声称断网。
不要默认执行全量npm ci/全部验收；先检查node_modules、输入指纹与既有报告。
测试网页统一examples/tasks/demo-form.html；驱动用自己临时端口服务同一文件，保留他人的43111服务。

## 评分与最终交付
原六维权重：安全25、ESM20、用户/Codex20、锁/离线15、真实Chrome15、简洁/兼容5。目标95，证据不够就如实低于95。
旧独立评分87/100基于native-11实际Codex失败，已不是当前完整证据；不能直接复用旧评分，也不能自动加分到95。
分别报告设计、组件、真实Mac开发Chrome证据与扣分。原603+19/B05/1000 mixed/10 reconnect/resource/F3正式框架合同未正式关闭；用户当前暂缓生产/ZIP，不为凑分开发排除业务、不冒充最终框架PASS。
最终给出最新main及PR状态、实际改动、JS/HTTPS/npm/Codex结果、真实runId/resultId/documentId/sourceHash、Node/CI/Native/Chrome报告、六维评分、明确剩余缺口与暂缓项。
开发者负责JS源码，OpenDesk在可信边界内构建、运行、验证；不恢复@require表单，不添加依赖URL表单，不通过网页动态下载未打包远程JS绕过构建。

