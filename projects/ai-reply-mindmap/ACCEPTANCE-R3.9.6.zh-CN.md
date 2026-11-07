# ChatGPT Mind Map R3.9.6 · Mac 验收记录

2026-10-17。当前结论：正式安装仍阻塞，总体 `NOT_SCORED`。程序保持 `opendesk.chatgpt-mindmap / 0.2.0 / BUILT_UNVERIFIED / installable:false`，58262 字节，sourceHash `7c481de07b813caa472121df15e6601cd97d135afd41bf6b2a70993d4b617f92`。未加入 production 厂商资源，未改变原 provenance 批准字段。

| 验证层级 | 本轮证据与边界 |
| --- | --- |
| Node | 生命周期 133、许可 86，通过；0 FAIL / 0 SKIP。共 219 个组件测试，不是 Chrome 安装验收。 |
| 源码检查 | 797 个源码/测试/构建文件通过。 |
| production Build / Package Verify | 冻结快照通过；packageHash `416b2079de26863bc661bb995482d1af150bd16f6924558a9b626caa52bf2631`。 |
| development Build / Package Verify | 冻结快照通过；packageHash `3514ff0e6def7d13f368925d169032c2c2d073adbd048fb1e9a402108a794c56`。 |
| Mac 原生 OpenDesk 扩展 | R395 冻结包真实加载及入口 smoke 已通过；本轮最终候选记录见机器索引，不提升为 Mind Map 安装。 |
| REAL XMind | 复用相同源码的 R394 fixture 绘图、隔离和 20 次清理；不是 production 或真实 ChatGPT 导图。 |
| Mind Map 正式 Broker 安装 | BLOCKED，未执行。 |
| Mind Map 正式生命周期 | NOT_TESTED。 |
| 真实 ChatGPT Mind Map | REAL_CHATGPT_NOT_TESTED。R395 的真实匿名回复不改变此状态。 |

构建输入为提交 `e81be4c8464e0d11379564f5ab2664d98f1ced28` 的明确路径快照，加本轮两个 runtime 源码文件覆盖；不是当前根目录全部并行未提交修改。每种构建的前后源码指纹一致，分别通过独立 Package Verify。根目录 `dist/development` 仍由原 watcher 持续写入，未替换日常扩展。构建的早期输出锁拒绝、空输出尝试和复审修复前的候选均保留，不冒充最终候选。

许可审计新增六份原始参考，合计 22 份。JSZip 与 polyfill 为完整字节映射；[babel-polyfill 6.26.0 原始包](https://registry.npmjs.org/babel-polyfill/-/babel-polyfill-6.26.0.tgz) 的 registry SHA512 integrity 与 dist SHA256 均已核对。polyfill 包含的 regenerator 历史 BSD LICENSE/PATENTS 单独保留，不简化为一个 MIT 标签。[Snowbrush 官方固定 CDN 文件](https://assets.xmind.net/www/assets/vendor/js/snowbrush-2c2b5d62b5.js) 与预览原文件相同，只关闭官方载荷来源，未关闭源代码/构建映射或再分发授权。

仍缺 SDK 精确构建、Snowbrush 精确构建与产物授权、GSAP 3.5.1 历史条款适用性、嵌入 Pako 版本及文件级 MIT/Zlib 对应、完整依赖和 NOTICE 闭包。Pako 早期比较因 Terser 输出为空被明确作废；修正后非空比较仅 6/16 个模块相同，16/16 变异负对照均不同，仍为 UNMAPPED。所有失败材料保留。完整性 CLI 成功不表示许可批准；`--require-approved` 仍拒绝。

安全工程接入现有已安装 Page Authority、执行世界账本与受管 UI registry，没有新建安装器、Host 或权限系统。执行绑定包含 Program/Revision/sourceHash/manifestHash、安装 ID、授权代数、executionKey、回执 nonce、编译哈希和原 document。停用、撤权、卸载、升级尝试退休已登记资源并等待异步 dispose；缺回执、失败或观察不确定时保留栅栏，不重放。只读确认原 UUID 消亡后才可标记 `contextGone/retired`。未登记业务副作用仍可能需要刷新。

独立复审最初发现一个 P2：unknown 状态不再查询原文档死亡。已修复并增加 missing-receipt、cached、failed 三分支回归，133/133 通过；复审确认关闭。许可差异和原生包观察脚本未发现其他有据 P0–P2；这不是十维总体评分。

批准的可执行子帧 loader 仍未实现：当前公开资源类型没有可执行子帧声明，缺少固定资源、不可变 Revision、原执行槽与真实父/子 document 的完整绑定及退休合同。受管 UI 清理是可复用的前置能力，不能当作 loader 完成，也不能以私有 `frameFactory` 注入代替。许可不阻止继续通用 loader 工程；许可未闭合则禁止装入生产 XMind 资源及提升 Mind Map 状态。

状态继承：MM-01 BLOCKED；MM-02 PASS（仅 fixture 隔离）；MM-03 BLOCKED（正式安装未执行）；MM-04 NOT_TESTED（真实 ChatGPT 导图未执行）；MM-05 NOT_TESTED（原关闭合同未定义）。

原始证据：`artifacts/chatgpt-mindmap-r396-mac-20261017/`；[机器索引](tests/mac-acceptance-r396.json) 保存输入与回执哈希。R395 的 19 个任务文件已独立提交 `1fbba04d42e55574f88f20a9069308b2b835cacf`。本轮不推送、不发布。
