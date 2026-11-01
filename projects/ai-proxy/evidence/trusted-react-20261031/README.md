# AI Proxy 官方可信 React · 本轮审阅入口

核心开发完成，最终版本 **0.3.8**。官方安装通过精确准入后使用工作台唯一 React Root 的静态 portal 和既有 Shared UI；录入弹窗的标题及操作区完整可见，长表单只滚动字段区。真实 CFT155 的原官方更新、管理、草稿、保存回读与重开已验证。未提交、推送或发布。

## 先看修改前后

相同保留的 CFT155 窗口、默认缩放，原入口「AI Proxy → 管理全部 → 添加代理」。本轮没有缩放或物理宽度专项矩阵。

| 修改前 0.3.5 | 修改后 0.3.8 |
| --- | --- |
| [原生截图](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/evidence/trusted-react-20261031/before-dialog.jpg)：弹窗靠下、底部动作超出可见区域 | [原生截图](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/evidence/trusted-react-20261031/after-dialog.jpg)：完整可见、初始焦点在主机 |

![修改前：按钮落到可见区域之外](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/evidence/trusted-react-20261031/before-dialog.jpg)

![修改后：标题与保存取消完整可见](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/evidence/trusted-react-20261031/after-dialog.jpg)

[展开长表单的截图](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/evidence/trusted-react-20261031/after-dialog-expanded.jpg)另证明底部操作保持可见，字段区可滚动。截图是原生捕获原文件，没有拼接、裁剪或生成补画。

## 问题与改动

原业务已经是 React，并已使用共享 Button。可信入口却仍锁在0.2.0，实际官方0.3.5回退到了iframe。旧沙箱的内容高度上报和宿主高度约束可能共同放大布局问题；本轮没有实测其数值反馈增长，不能写成已证明的唯一根因。

本轮复用原App/Surface、唯一Root和SDK/Host/Authority，更新经审查的固定版本及来源锁；修正可信容器的剩余高度链、原生dialog三行布局，补齐当前页请求与变化事件。未创建第二套UI、Host、安装器或组件包，未增加依赖。动态改包、同ID第三方及本地动态调试继续受原沙箱限制。

真实安装曾暴露0.3.7的TSX JSX模式差异，导致`React is not defined`。14个TSX只补显式React导入，组件检查改为与宿主相同的classic JSX；0.3.8真实侧栏已能正常打开和反复关闭重开。旧错误及其后续removeChild错误原始证据保留，未作修正后完整Console巡检，因此不声称所有历史Console错误均已消失。

来源复核还发现Vite展开CSS后部分叶子可能漏锁，已改为校验全部57个输入及递归CSS导入；拒绝漏锁、改字节、符号链接、远端和越界导入。备份文件的异步读取也绑定原环境、revision和卸载generation，避免迟到结果污染重开的界面。

## 操作与验证证据

| 范围 | 结果与实际边界 |
| --- | --- |
| 保留CFT155原生侧栏 | 原官方审阅链升级0.3.8，权限未变化；原有配置和规则保留；当前网站正确识别及切页重读；完整弹窗、焦点、Escape保留/放弃通过 |
| 原生保存回读 | 既有本地HTTP名称作可恢复修改，保存并重开读回，再恢复原名；地址及端口未改，始终未应用代理；没有遗留测试配置 |
| 组件真实Chromium155 | 8组检查通过：无iframe、真实Host高度链、长表单/操作区、焦点、草稿、普通代理保存不应用、保存继续添加、七区和三语；服务使用内存，不能替代原生安装证明 |
| 定向Node | **85/85 PASS**：准入、当前页权限与事件清理、草稿/备份异步、导航、环境及unknown不重放 |
| 来源检查新增用例 | **2/2 PASS**，覆盖展平模块表漏锁、递归孙级、远端/越界导入和symlink拒绝 |
| 共享来源测试完整单文件 | **18 PASS / 9 FAIL**。9项为既有Bookmark/Time Review/Reading TOC旧`examples/`路径fixture漂移；未扩大本轮修改。原始失败日志保留，不宣称全套绿灯 |
| 构建和包 | 原Vite编译、唯一打包器候选→晋升→check-project同源核对PASS；已有Browser dev watcher发布最终构建，没有第二writer覆盖输出 |
| 独立审阅 | [审阅记录](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/evidence/trusted-react-20261031/reviews.md)：未发现剩余P0/P1；最终窄增量CLEAR，整体WATCH；保留已有P2及验证边界 |

原生逐步结果、原始AX/日志的路径与SHA256见 [native-core.json](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/evidence/trusted-react-20261031/native-core.json)。组件输入哈希及几何数据见 [component-report.json](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/evidence/trusted-react-20261031/component-report.json)。组件Host底部900/视口900；展开dialog底部888，操作区仍在视口内，字段溢出滚动为true。

## 人工查看代码

[逐文件修改理由与行号](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/evidence/trusted-react-20261031/changes.md)按业务、宿主、构建信任、验证及材料列出本次增量。

- [可阅读的源码补丁](/Users/shopme/Documents/workspace/opendesk-browser/artifacts/ai-proxy-trusted-react-20261031/task-source.patch)：从任务开始时dirty字节生成，省去生成安装包与审阅附件。
- [全部文本增量补丁](/Users/shopme/Documents/workspace/opendesk-browser/artifacts/ai-proxy-trusted-react-20261031/task-all-text.patch)：包括生成JSON和文本证据；图片原文件单独保留。
- [基准清单](/Users/shopme/Documents/workspace/opendesk-browser/artifacts/ai-proxy-trusted-react-20261031/baseline.json)、同目录`before/`及 [最终文件清单](/Users/shopme/Documents/workspace/opendesk-browser/artifacts/ai-proxy-trusted-react-20261031/task-files.json)：前后SHA256、字节数、增删行和本次归属；补丁在临时目录回放后逐字节核对。

基准HEAD为`7026465ff2c58db8de7cec53afbdd8b6126a91af`，但**dirty起点字节才是本轮对照基准**。原已有业务改动、其他Agent改动及Git历史不归于本轮；不能直接把`git diff HEAD`作为本任务贡献。

## 候选身份与后续维护

唯一正式包 [ai-proxy.opendesk-tool.json](/Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy/ai-proxy.opendesk-tool.json)：0.3.8，923359字节，SHA256 `2199ca3b9c2efeff2b8a96779a0d883c7c410a0e0c829653627df6d734b274ca`。权限仍为`storage.local/currentPage.read/browser.proxy.managed`。

实际验证为 **持续开发环境** `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，原生扩展ID`ccfcjegpkdlgbclopjmadlcjedelidmf`；Debug明确显示开发服务已连接，revision `1ea74bc3e058f44edb8776a11e04aea52775c40045f5631b75350ea2f329320a`，tool-shell SHA256 `97b04a865693e4d39d6cdaa2ae01586d1f8dbee1fd7fe77b9541f3a5eea80acb`。不是production验收。

以后改静态可信UI，需要复核受影响来源、更新锁并生成对应Browser构建；独立JSON不会替换可信静态组件。日常Chrome若仍安装旧版，需通过原「扩展管理 → 审阅新版」更新到0.3.8；本轮仅在保留的CFT完成安装，未操作日常Chrome的代理。

三语、四模式、七区、配置/规则及原SDK权限合同保留。完整类型检查、全CI、production、评分、缩放/宽度矩阵、真实代理流量/认证/PAC/订阅联网及完整原生改包/撤权竞态链均为 **NOT_TESTED**。既有外部代理状态自动推送、pending确认清理属于后续边界，不因此扩大本轮API或恢复全量验收。
