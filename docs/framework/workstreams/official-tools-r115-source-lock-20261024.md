# 官方扩展 R1.15-CORE — Prompt 来源锁定工作记录（2026-10-24）

- 写入 owner：本轮官方扩展 R1.15-CORE（GitHub main 直写）。
- 写入边界：`scripts/bundle-provenance.mjs` 的三项精确 Blob SHA 和审阅说明；本文件记录。未改 Installer、Host、DNR、权限、正式 JSON 或远程发行信任锚。
- 继承 main 基线：`d020476ae8570e0fc63dcb19cfe087d1ba654724`；目标 Blob 已与本基线逐一重读。其他并行文件不覆盖。
- 原始目标：十二项官方扩展安装即用、授权最小化、保存和重启可靠、合法升级/卸载、跨工具隔离；三项预装：reading-toc / quick-notes / cookie-editor。
- 首要阻断：Prompt trust compilation source pins drift in `model.js`, `page.js`, `chatgpt-jump-top/src/conversation.js`; this blocked Time Review / AdBlock builds.
- 静态审阅：逐行对比旧锁指向的 Git Blob 与当前源码。model 仅引入可选导航布尔配置及 schema:1 兼容默认值；page 新增只读区域识别、显式用户手势滚动，点击前复核安装/停用/epoch/Origin；conversation 引入双向滚动、同 Doc 多 owner 隔离。未发现新增特权目标、外网 Origin、自动发送或删除拒绝门槛。其余五项 Prompt Blob、十二项 Stay Focus Blob、十二项 AdBlock Blob 与已有锁一致。
- 本次目标：只更新三项已审阅精确来源锁，仍然拒绝任何后续未知改动；未放宽白名单或来源校验。
- 证据等级：SOURCE=reviewed/updated；NODE=NOT_TESTED；CHROMIUM=NOT_TESTED；NATIVE=NOT_TESTED；RELEASE=NOT_TESTED。必须让当前提交触发 CI 并检查定向 Prompt 模型/权限/滚动测试，再从当前源生成候选、测完后合法晋升，不可宣称本轮成功发布。
- 未完成：Prompt 页面原始 rail 几何 8/32 场景失败；Stay Focus 正式旧包与 React 编译候选字节不一致；Time Review 合法旧版安装升级 Native；AdBlock HTTP/DNR Native 实测；十二项完整发行门禁。Stay Focus Ed25519 信任锚尚待真实发布者批准，远程升级 BLOCKED。
