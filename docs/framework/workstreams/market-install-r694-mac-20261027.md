# 应用市场 R6.9.4 · 真实安装、卸载与状态收敛

2026-10-27；owner：Codex `01a17dc5-0bdc-7e03-8d36-6006d2418217`。当前结果：**开发市场本地核心闭环 PASS**。真实安装、卸载、刷新、重装以及实际书签读取／搜索均已完成；首次敏感权限由用户单独确认后在 Chrome 原生弹窗允许。正式公开发布和完整95分验收不因此变为 PASS。

## 范围与源码身份

- 起始 `main`：`eaf49703c64d037d1d59b6fc471eb3daf666203a`；开工远端 main 实读 `0e06188dcb8a679bd95d8811a26372ba68a270b3`。保留 R6.9.2 的 `6b8f9f47`、`0e2154e4` 和 `47d4568c` 的其他行为，没有整体 revert。
- 并行 Git owner 后续合入两侧历史，本轮冻结基线为 `ccdd8dece5604219dbbfc15cef0bc578273cef5e`。其 `7ed551d50` 已提交原 R6.9.3 遗留的五个工具版本配置和其他会话代码；这些不是本轮新写的业务改动。
- 只使用 main；没有创建分支、worktree、PR，没有推送。子 agent Singer 独占网页及相关状态测试修改；Volta 全程只读审计；均不操作 Chrome。
- 最新用户 R6.9.4 明确网页职责，解决前序冲突：网页仅发起安装审阅、恢复未决原事务回执；不读取全局安装状态，不提供网页打开应用入口。后台原协议保留。

## 本轮必要修改

1. `src/market-site/client.js`：移除网页 `GET_APP_STATUS`／`OPEN_INSTALLED_APP` 分支和状态缓存；历史终态收据不跨刷新恢复，回到页面撤下临时成功提示，成功明确为原事务回执。未知结果仍查询原 intent，不自动提交。
2. `src/market-site/templates.mjs`：文案与上述职责一致，主打开入口指向原 Side Panel。没有 CSS、布局、第二 React 根或应用业务重设计。
3. `src/marketplace/status.js`：独立审计发现“成功回执未读即卸载”会卡住重装。仅当原成功日志身份匹配、已消费且未取消、当前工具和来源均已移除时，复用 `handoffClosed` 结束旧交接；不声称当前已安装，不提交新事务。缺失日志、真正 UNKNOWN、身份冲突仍不因缺包而关闭。
4. 对应四份现有测试：`market-site-client-r5`、`market-page-install`、`market-panel-handoff`、`market-panel-navigation-r691`。原 Installer、ToolHost、Authority、安装 Sheet 与书签业务源码未修改。
5. 完成前序中断的五份正式 JSON 晋升：ai-knowledge-answers 0.1.6、quick-notes 1.1.11、markdown-workbench 1.0.7、bookmark-manager 0.3.13、prompt-shortcuts 1.1.21。原 builder 合并全部官方发行，旧同版本异字节是当前网站生成的实际阻断；没有删除历史发行、放宽 immutable 校验或修改工具能力。复用前序候选，经原打包器逐字节核对、`--promote-from` 和五份 `--check-project` 通过。其他业务不扩展。

## 实际运行环境与资源保护

模式为 **STATIC_DEVELOPMENT**，standard edition，未连接 watcher，不是 production 验收。

- 一个实际 Mac 稳定 Chrome Profile：`OpenDesk Market R691 MAC 20261027`（Profile 2）。
- 本轮真正加载并启用的 ID：`ohaeeclocebclfgledeflhmdpaemglmp`；Chrome 详情实读路径：`artifacts/market-r694-mac-20261027/source-snapshot/dist/development`。
- 市场：`http://127.0.0.1:43133/apps/opendesk/bookmark-manager/`；channel 同一 ID；实际 Manifest `externally_connectable.matches` 为 `http://127.0.0.1:43133/*`。
- 最终扩展 packageHash：`1bee9c73aa2ffebeeb78d76f30c9efe6aa455e02b5094ec74f47e46e94de0224`；网站 buildId：`6b985821c553ed9b883028c6cc98ef7d5cc2ef46e7be018a518f634351ca71f2`。
- 关键产品输入与原仓库逐字节相同，见本机 `acceptance-receipt.json`。初版候选真实安装后，仅因状态修复进行一次必要重建并在相同路径/ID重载；最终候选真实完成卸载和重装。不能把初版构建哈希冒充最终候选。
- 保留旧测试扩展 `efdideaeenealogeamjmlbffhhjohelg` 和原应用。旧服务器 43132 / PID 81835 未停止、未改写；日常 watcher 43119 / PID 2676、日常 `dist/development` 与 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 未覆盖。以上 PID 是当时观察，续跑重查。
- 本轮独立网站服务在 43133，保留供续跑；没有第二个写入日常输出的 watcher。静态 snapshot 是普通忽略产物目录，不是 Git worktree。未修改 Native manifest、配对或用户书签。
- 原生控制曾被其他日常窗口夺取焦点，已重新按窗口/Profile和实际ID核对；默认输出的 AX 索引有偏移，后续统一使用 `emit:false` 原始状态。截图 API 不可用，证据为实际 Chrome 原生 AX 文本，不宣称有截图。

## 真实用户操作证据

本机原始证据目录：`artifacts/market-r694-mac-20261027/native/`；未将忽略产物提交。

| 操作 | 结果 | 证据文件 |
| --- | --- | --- |
| 核对已启用扩展、真实加载路径和连接 | PASS | `01-loaded-extension-details.txt`、`02-market-ready.txt` |
| 网页点击安装，原 Side Panel 可信审阅一次确认 | PASS | `03-install-handoff.txt`、`04-trusted-review.txt`、`05-install-confirmed.txt` |
| 成功 Sheet 点击打开使用 | ToolHost 路由 PASS；首次缺权限（后续已授权） | `06-direct-open.txt`，进入书签工具自己的权限设置，未进入 ExtensionDetail |
| 停用目标扩展并重新连接，保留旧副本启用 | PASS | `08-disabled-connection.txt`：`E_NO_RECEIVER`，明确目标新 ID；随后恢复启用 |
| 原 Side Panel 卸载本次测试书签应用 | PASS | `10-uninstall-review.txt`、`11-uninstalled-list.txt`：读回卸载，列表5→4 |
| 网页刷新，无旧已安装声明、无自动审阅 | PASS | `12-refreshed-after-uninstall.txt` |
| 再次显式安装、原审阅一次确认 | PASS | `14-reinstalled.txt` |
| 固定身份、版本、来源及摘要 | PASS | `15-installed-identity.txt`：opendesk/bookmark-manager 0.3.13，89,315 B，SHA `7267020eb9f6a8458558a857dc4ae1d9fbbcbdf7d74812a83fb84e713c305ed9` |
| 重装后打开、权限未自动授予 | 路由与权限保护 PASS；读/搜索见后续证据 | `16-reinstalled-open-awaiting-permission.txt` |
| 用户确认授权后真实读取和搜索 | PASS | `18-bookmark-permission-granted.txt`、`20-bookmark-permission-recheck.txt`、`21-bookmark-search.txt` |

安装与卸载均使用浏览器内部原链路，没有安装或配对额外桌面客户端／Native Host。机器已有其他会话的 Native 服务，未操作；不声称整机不存在这些进程。只卸载本轮新 ID 下的测试工具，不删除原用户书签或旧扩展数据。

当前书签工具需要独立 Chrome 完整书签权限，授权也可编辑、移动、删除全部书签。安装后授权开关保持0，符合不能自动授予的边界。用户随后明确答复“授权此测试 Profile，继续只读验收”；在同一 Profile、同一新ID的原工具设置发起授权，并在 Chrome 原生“读取和更改您的书签”弹窗允许。授权开关读回1，随后原工具完成SDK检查并读取3个根/目录节点，搜索“书签栏”得到1/1结果；未新增、编辑、移动或删除任何书签，没有借用旧扩展权限。

## 用户确认后的最小续跑

- 用户明确批准测试 Profile 的完整书签权限，继续只读验收；没有再次索取同一确认。
- `17-bookmark-permission-request.txt`：原生权限弹窗明确“读取和更改您的书签”。
- `18-bookmark-permission-granted.txt`：同一 ToolHost 授权开关为1，“已授权本工具访问全部书签”。
- `20-bookmark-permission-recheck.txt`：原工具SDK检查完成，实际书签树显示3节点、书签栏和其他书签目录。授权后初始检查尚未就绪时使用了现有“重新检查SDK与权限”按钮；没有改代码或重复授权。
- `21-bookmark-search.txt`：搜索“书签栏”，全局搜索显示1/1目录结果。测试 Profile 中没有真实用户书签条目；不为制造结果创建书签。
- 此次读取证据属于原已完成重装的最终同一候选，原安装/卸载/刷新/重装和必要回归证据继续有效。没有产品源码变化，不重建或重跑测试。

## 最小验证与已知限制

- 网页、page-install、panel-handoff、Sheet、navigation 五文件子集：**172 PASS / 0 FAIL**。该数是同一次194项命令的子集，不是单独重跑的全绿命令。
- 同次额外 dynamic-install：13 PASS / 9 FAIL。以变更前 `HEAD:status.js` 内存替换对照，仍为相同9项失败；未修改该旧套件或将总命令标为通过。原始输出、提取子集与失败名称见 `r694-test-evidence-manifest.json`、`r694-tests-combined-full.log`、`r694-dynamic-install-baseline9.log`。旧测试中仍有 trusted popup／网页状态协议预期；不据此扩展本轮产品。
- 包预晋升检查27项中26 PASS / 1 FAIL，失败为无关 AI VIP Share 正式包1.4.1与源码1.4.2漂移；记录后延期。目标五包同源校验全部 PASS，见 `package-postpromotion-checks.json`。
- 最终静态开发构建 PASS，网站构建 PASS，`git diff --check` PASS。未新增依赖。
- R6.9.2 CI `40513098611`、后续CI `40517011891` 仅为各自旧候选历史 PASS；当前提交 CI **NOT_TESTED**，没有推送触发。
- 版本／摘要／enabled 改变拒绝打开、草稿守卫和 UNKNOWN／双击不重交由定向测试证明；本轮对应完整原生反例 **NOT_TESTED**。实际停用连接、不自动授权及用户授权后的只读访问已原生验证。
- 精确“网页未读成功回执即卸载”竞态由新增定向回归证明；正常原生重装链补证，未声称精确竞态也实测。
- 键盘、明暗主题及用户指定320/360/400/440/520px专项 **NOT_TESTED**；未修改CSS/布局，本次授权续跑只补实际读取/搜索证据，核心完成后按用户停止规则收尾，不扩大矩阵。
- 正式渠道 `acquireUrl` / `verifiedAt` 为空，当前仅本地 HTTP；**PUBLIC_RELEASE_BLOCKED**，不以本地结果替代公开 HTTPS 发布。

## 反方审计与独立评分

- 打开不会进入技术详情：成功 Sheet 调用原 `openInstalledApp → extensionCenter.openInstalledMarketApp → sidebarTools.openTool`；新候选先显示 ToolHost 自身权限设置。用户批准首次书签权限后，实际进入该工具独立沙箱中的书签树和全局搜索，没有进入 ExtensionDetail，也没有要求再次安装。
- 卸载不会被历史成功误导：网页不维护长期安装态，终态收据不跨刷新恢复，成功明确仅为原事务；真实卸载刷新显示安装按钮。旧成功日志已终结但未读时，精确身份匹配且包/来源已移除才关闭旧交接。
- 变化与未知不会错误启动或重装：原打开链重新校验版本、摘要、来源及enabled，未知只查询原事务；连接失败实测拒绝，身份与UNKNOWN边界定向回归通过。未进行的原生反例仍保留 NOT_TESTED。

独立只读审计 Volta 复审关闭原HIGH，无新源码阻塞，给出当前证据评分，满分各100；不是八位专家或正式发布批准：

| 产品UX | Chrome架构 | 安全 | 状态一致性 | 测试证据 | 维护性 | 发布工程 | 跨对话去重 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 90 | 92 | 93 | 90 | 89 | 87 | 87 | 89 |

算术平均 **717 / 8 = 89.625（约89.63）**；各维≥95目标未达。独立审计核对新增原生证据后认可本轮限定核心闭环PASS，无新增代码阻塞，代码审查维持COMMENT。测试Profile只有空目录，本次证明3节点读取及目录搜索，不扩称非空网址书签、大型树或完整生命周期验证；授权后撤权、公网和其余原生反例缺口继续扣分。

## 续跑的唯一最小动作

用户已确认授权，唯一阻断已解除；同一候选实际读取与搜索通过，按核心闭环完成即停止的要求收尾。当前没有本轮核心操作待办；公开HTTPS渠道、其余原生反例及UI矩阵仍保留原验证等级，不自动进入正式发布／完整95分验收。源码提交 `174ce7a072678cea7b4d534e547652379f66b9cd` 不变，本次仅补记录；不重复安装、卸载、构建或已有效测试。未操作其他会话资源，没有伪报原生goal生命周期，也未创建自动化或新对话。
