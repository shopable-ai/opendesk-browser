# ChatGPT Mind Map R3.9.4 · Mac 实施与验收

2026-10-17。真实业务 iframe 集成及 Mac 原生测试通过；**正式发行、Broker 安装仍为 BLOCKED，总体 NOT_SCORED，未达到十维均 ≥95 的验收目标。** Program 保持 `BUILT_UNVERIFIED / installable:false`，版本 `0.2.0`。

## 实际修改

- `src/xmind-frame*.js`：显式模块注入的私有 MessagePort 接缝。每次打开绑定随机 session、回复实例及 revision，验证请求序号、命令、响应和超时，销毁时关闭端口并清理迟到资源。子模块复用原 XMind adapter，不重写引擎。它不是公开 SDK，也不是已批准的生产加载器。
- `src/main.js`：默认入口在任何回复 DOM 修改前拒绝缺失的批准运行时；测试通过显式工厂连接真实子文档。不从网页全局获取 loader。
- `src/view.js`：真实 Chrome 暴露全屏重挂载导致 iframe 重载；改用保留状态的 `moveBefore`，不支持的浏览器在改变状态前拒绝。依据 [Chrome 官方 moveBefore 说明](https://developer.chrome.com/blog/movebefore-api)。
- `src/answer-registry.js`：旧视图迟到失败绑定其会话，避免关闭后来打开的新视图；回收失败保留为清理错误。
- 三份定向 Node 回归及 R3.9.4 Mac 探针：覆盖消息边界、清理、全屏连续性、过期视图错误。旧 R38/R393 增加 Mac Playwright 路径参数及新默认入口拒绝的诚实结果分类。
- 原有 CI 新增业务 iframe 原生测试步骤，上传 JSON/PNG，保留失败退出；本轮未推送，因此未声称新 CI 已运行。
- 许可参考原文、SHA 及审查 JSON：补充八份版本化上游许可材料，没有赋予再分发批准。

没有修改 Browser Framework/Broker/Host/权限系统，没有新增依赖，没有将厂商字节加入 production。`xmind-adapter.js` 继续复用原实现。

## Git 与环境身份

| 项目 | 实际值 |
|---|---|
| 开始 HEAD | `3a4ab704f6adfc9821b9b7270b96b7430900b22d` |
| 首次 fetch 远端 | `dd7f475459c300052d3bdf812a5b67b28f5cf868` |
| 完整构建/候选审计时 HEAD | `4c28a087dc2c4e3175ed7e8785dd5cb524e1323a` |
| 最终安全 fast-forward 集成基线 | `404ccc681f3c061218701258c8705d3d724fa3a7` |
| 分支 | 仅 `main`；未创建分支、worktree、PR |
| Program | `opendesk.chatgpt-mindmap` / `0.2.0` / `USER_SCRIPT` |
| Program sourceHash | `7c481de07b813caa472121df15e6601cd97d135afd41bf6b2a70993d4b617f92` |
| Program 字节数 | 58,262 B |
| Mac 浏览器 | Chrome for Testing `156.0.8078.4`，macOS arm64，独立一次性 profile，mock keychain |
| 未修改 production 扩展 ID | `efhcmggbgamacpfhhmooelgdkepdcghh` |
| production 加载路径 | `/Users/shopme/Documents/workspace/opendesk-browser/dist/production` |
| production packageHash | `cda7406555187d7372603bca91890de1e481dae71cc389ce23b444177db29e9f` |
| 已验证静态 development packageHash | `db68a404688cd0f34b62f2bb9658c13def2a0114836380a4acc991757694ba94` |

并行 Agent 的 adblock、prompt-shortcuts 改动保留；后续远端两项预览提交与本轮编译输入不重叠。最终提交 SHA 见 Git 历史及交付回复。未推送 main。

本轮先按静态开发包/production 独立验收包验证。收尾时其他会话已启动本仓库 `npm run dev`，写入固定 `dist/development`，监听 43119/43120，观察到两条服务连接；本轮没有将其与日常 Chrome 的具体扩展 ID 配对，故不能声称已验收其浏览器连接。静态 development 哈希仅对应此前完成的静态包。未停止或覆盖该 watcher，未改日常 Chrome 数据。

## 真实结果与证据边界

| 验证 | 结果 | 可证明的范围 |
|---|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS | 原锁定依赖安装 |
| 资源 verify + license audit | PASS / BLOCKED | 四份原始字节共 4,042,573 B、SHA 一致；许可审计执行成功但准入结论 BLOCKED；强制许可门禁按预期非零退出 |
| 用户指定 Node 全部定向测试 | **113 PASS / 0 FAIL / 0 SKIP** | 设定 `XMIND_REFERENCE_DIR` 指向真实 preview，未跳过 REAL SDK；包含 Page 安装/库组件测试，不等于原生安装 |
| Program validate / build / audit | PASS | 当前源码匹配，仍不可安装 |
| `npm run check` | PASS | 793 个源码/测试/构建文件 |
| `npm run build` + production verify | PASS | 当前完整 production 静态包、零构建期源码漂移 |
| `npm run build:dev` + development verify | PASS | 当前完整 development 静态包、零构建期源码漂移 |
| 未修改 production 包 Mac smoke | PASS | Chrome 实际加载路径/ID、Service Worker、原生 UI 开启 userScripts 后真实 API 可用；未安装 Mind Map |
| R38/R393 对当前候选 | 部分 PASS / 绘图 BLOCKED | 固定资源执行与 opaque 隔离、正式入口 `PASS_FAIL_CLOSED`；`renderProof=BLOCKED_PRODUCTION_FRAME_LOADER_RENDER_NOT_TESTED` |
| R3.9.4 当前业务真实 XMind | **PASS** | 原 registry/view/工具栏 → 三个独立 opaque iframe；父文档 Snowbrush 样式 0；没有 SVG/Mock 替代 |
| 当前业务交互 | PASS | A/B/C、缩放、折叠、全屏子文档连续性、三条主题命令真实回执、原始 HTML 逐字节恢复；关闭 A 不影响 B/C |
| 当前业务清理 | PASS | 20 次开关及直接业务 Stop 后无剩余帧/UI/父样式；外部请求 0。这不是内存堆无泄漏或 Broker 撤权证明 |
| 完整输入闭包补充测试 | PASS | 后续 1 次循环；新增 fixture/provenance SHA 及结束复核。与 20 次记录的公共源码及全部 12 个编译模块相同，旧 receipt 未改写 |
| 正式 Broker 安装及生命周期 | BLOCKED / NOT_TESTED | 未执行 Verified→Available→Installed、正式自动运行、停用、撤权、升级、卸载、重启及失败恢复 |
| 已登录真实 ChatGPT | **REAL_CHATGPT_NOT_TESTED** | 无独立已登录测试会话；没有操作私人对话或保存原文；fixture 不替代真实站点 |

早期 development 构建两次遇到并行 `src/ui/sidebar-tools.js` 源码漂移，独立文件快照第一次因 node_modules 软链接越出仓库而被安全门禁拒绝。未降低门禁；修正本地快照依赖路径后通过，随后根目录最终两种构建均通过。最新 main 未再复现 React constructor/input tracker/event replay/bind 历史错误，无须修改并行 React 实现。

真实业务测试首先发现全屏导致 iframe 重载，修复后定向复验；主题命令原 3 秒观测窗口不足，保存失败，再改为与实际协议一致的 30 秒窗口，三条真实应答均成功。失败原始日志保留，没有改写成 PASS。

## 许可与正式接入阻塞

唯一固定资源来源仍为 `tests/xmind-provenance.json`，未改写其批准字段。[许可审查](tests/xmind-license-review-r394.json) 绑定该文件 SHA，并保存八份上游版本化许可证原文。尚未证明：

1. 四份固定产物与精确上游构建/版本的完整映射；XMind SDK 参考 tag 与 package 版本不一致。
2. Snowbrush 精确合并产物的再分发许可。
3. GSAP 3.5.1 历史 GreenSock 条款的实际适用性。
4. 全部传递依赖、Pako 文件级 MIT/Zlib 对应关系及 NOTICE 闭包。

因此 `redistributionApproved:false`。技术渲染通过不构成法律许可批准。

iframe 模块的私有端口与业务身份边界已验证；**生产固定代码子帧加载路径仍未获得准入**，尚未将厂商字节绑定到正式 Broker 的 Program Revision / 文档 / 执行槽。需要在现有 Authority 内完成合法资源准入及独立平台实现/审查，随后才能走原安装链；没有创建第二套 API/安装器。默认入口持续拒绝未获批准运行时。

## MM-01 至 MM-05

| 项目 | 状态 | 解释 |
|---|---|---|
| MM-01 | BLOCKED | 许可与生产固定资源未获批准 |
| MM-02 | PASS（限定） | 当前 Mac fixture 业务隔离 PASS；不提升为正式生产部署关闭 |
| MM-03 | BLOCKED | 原 Broker Verified→Installed 未执行，前置准入未满足 |
| MM-04 | NOT_TESTED | 真实 ChatGPT 未验收；本地业务 fixture 单独 PASS |
| MM-05 | NOT_TESTED | 继承账本仅标 PARTIAL，未定义可核实的独立关闭合同；不编造含义或宣称关闭 |

## 独立十维评审

只读复审发现并关闭：全屏帧重载、旧视图迟到错误、原生证据输入闭包三项问题；最终没有本轮未发行范围内剩余可操作问题。下列为**组件范围**评分，全部正式产品评分仍为 NOT_SCORED。

| 维度 | 组件分数 /100 | 主要边界 |
|---|---:|---|
| 真实 XMind | 96 | 固定原始资源，测试扩展 |
| 视觉质量 | NOT_SCORED | 未完成正式站点视觉验收 |
| 内容正确性 | 92 | fixture 范围，不覆盖真实复杂回复完整性 |
| 回复隔离 | 96 | A/B/C 独立实例 |
| 交互 | 95 | 原生 fixture 范围 |
| 代码质量 | 94 | 本轮模块及回归 |
| 安全与隐私 | 94 | 已审查测试边界，生产加载尚未批准 |
| 性能与生命周期 | 90 | 20 次清理不证明 BFCache/堆内存或正式安装生命周期 |
| 正式安装 | NOT_SCORED | BLOCKED |
| 原生验证 | 96 | 临时测试集成及 Browser 包 smoke |

**没有总体 95+、Verified 或 Installed 声明。** 许可、批准的固定资源加载、正式安装生命周期及真实 ChatGPT 是尚未完成的产品目标。

## 原始证据与复用

[机器索引](tests/mac-acceptance-r394.json) 记录原始文件 SHA、候选身份、构建哈希、业务源码/实际编译模块闭包及独立复审范围。原始日志与截图保持在本机忽略目录：`artifacts/chatgpt-mindmap-r394-mac-20261017/`；它们不是可发行包，未强行提交生成物。

关键记录：`business-native-theme-observation/business-frame-probe.json`（20 次）、`business-native-input-closure/business-frame-probe.json`（完整闭包补充 1 次）、`package-smoke-final/package-smoke.json`、`r38-final/`、`r393-final/`、`build-final/`、`node-tests-reviewed.log`、`independent-review.txt` 及 `independent-review-addendum.txt`。失败目录 `business-native*` 和早期构建失败日志保留。临时原生测试扩展/profile/厂商副本均已回收。

本机逐步工作日志：`docs/framework/workstreams/chatgpt-mindmap-r394-mac-20261017.md`（按仓库规则本地忽略）。重用证据必须核对机器索引中的源码、编译模块、fixture、provenance 与候选身份，不因无关 HEAD 更新重跑全部验收。
