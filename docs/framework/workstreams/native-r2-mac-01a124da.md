# R2 Mac 配对与项目 GUI：01a124da

2026-10-10。Browser main、OpenDesk master；不创建分支/worktree，不推送，不发布。用户明确授权跨对话交接。保留其他任务修改、用户PNG、Node登记、个人Chrome、旧receipt与失败证据。

## 实施与身份

Browser R2实现提交 c8ecc96f4f6a729f1f35b485326d87c6b4767e8d；之后上游真实集成 e890c2c0、3e524329e58b6e395f9bc24277c1728a4a80bc38。Go初始R2实现 e97e4d54、上游7518e3e3，最后安全闭环提交5608b4294880c1ec9c068809d5670db9bb814eb6。本报告及script-editor测试修正的最终提交SHA保存在专属 evidence/candidate-final.json，不把外部新增功能称为本轮开发。

- 扩展开发配对采用真实按钮的同步用户点击，实际runtime ID、128 bit随机nonce和两分钟申请；opendesk:// URL不携带网页、目录或运行权限。App独立原生确认后才登记，取消/过期/重放拒绝。配对本身不请求Native权限、不添加项目、不执行。
- 普通授权连接仍通过现有真实chrome.permissions.request；显示Host登记、Native权限与实际认证连接三种状态。严禁猜官方ID、通配allowed_origins或新增第二个Controller。
- Sidebar无项目状态指向Go原生菜单。Go提供JS单文件、Controller/Page、精确Origin授权及撤销；用户刷新项目后明确Run。项目授权不自动运行。
- Go共享锁与完整读取屏障、私有事务journal、新旧代预检/回滚、目录fsync重试及未知提交结果保护；CLI预检失败明确NOT_DISPATCHED，EOF/合法UNKNOWN保留完整恢复身份而不重派发。详见OpenDesk专属报告。
- script-editor测试的默认匹配断言由旧当前网站改为上游已经实施的HTTP(S)候选；继续断言无能力、无自动安装、无自动Run。这是测试对齐，未扩大运行权限。

## 当前验证与旧证据

原始日志目录：`docs/framework/evidence/native-r2-mac-01a124da/`。所有失败日志保留。

| 输入 | 验证 | 结果/等级 |
|---|---|---|
| 初始R2/c8源码 | 79项定向、242文件check、26assets生产构建 | PASS，旧组件/构建输入 |
| e890+测试断言修正 | 167项受影响回归、252文件check | PASS，旧集成输入 |
| 3e524329+测试断言修正 | browser-3e-affected-final.log | 297 PASS，0 FAIL/skip，20个受影响组件测试文件 |
| 3e524329快照 | browser-3e-check-final.log | PASS，267文件语法/CSP/MIT/build合同 |
| 3e524329快照 | browser-3e-build-final.log | production PASS，32assets，packageHash de9cb7ef3ad68ef3af410aee4e1734d215be45318875a59295260e0ac31203ca |
| Go5608冻结快照 | Go五包定向测试、vet、ARM64 App构建 | PASS；日志在OpenDesk .runtime/tests/browser-r2-01a124da/ |
| 最终同候选安装/真实Chrome/GUI/ZIP | 没有当前候选原始receipt | NOT_TESTED |

Browser生产构建在独立git archive快照，物理复制相同package-lock的依赖；仅测试驱动把build锁端口改为0，不碰共享dist/43119/43120，不放宽包校验。快照不包含开发服务对话尚未提交的scripts/dev.mjs、wxt-development.mjs、wxt.config.mjs等修改。因此本次构建不能提升为包含这些工作区差异的最终正式安装包验收。Go App使用arm64+CGO_ENABLED=1，临时签名完整性检查PASS；首次缺少CGO失败日志保留，尚未安装、启动或替换CLI。

## 真实Chrome历史证据与标准页面

R5保管的历史真实受控CFT测试已迁到 http://127.0.0.1:43111/demo-form.html：Controller read run26ea8d02-4faf-40d5-9731-6bf1e811dcb1/result d82dd851-e8bb-4fa1-ba37-e4d5a29b0ee6，Stop run0c380668-1208-400d-add8-38d5e1101a3c/result908367cd-8ee5-4739-8222-ded8664ec9bf，原生权限弹窗截图、撤权、断连、重连和资源释放证据由R5原始日志追溯。全部是旧候选，不计最终同候选PASS；自动重连未观测，保留限制。63825专用fixture只留历史证据，不是普通用户测试入口。

R5已按用户要求暂停安装，CFT关闭；App/profile/CDP60189/r5-mac实例继续由R5交接，本轮无GUI/CDP、安装或Host变更。原始交接：OpenDesk `.runtime/tests/browser-native-r5/HANDOFF-FINAL-20261010.md`。

18:38检查发现43111服务已停止；R2恢复标准HTTP服务PID24818，只读提供examples/tasks。demo-form-server-43111.json记录HTTP200、标题、目录、负责人及时间；这是HTTP可达证据，不能称Chrome验收。开发服务对话PID24761/43119仍保留，不停止。后续验收者应先核对PID/命令/端口再接管，不杀其他Chrome或GUI进程。

## 独立反方审计与七项权重

只读Kepler审计和实现者分离。限定静态闭环复核未发现新的安全关键FAIL；真实故障组合、断电与最终原生验收未测。审计原文保存在OpenDesk专属日志，早期86/82因缺分项账本已由审计者修正。

| 类别 | 满分 | 设计 | 实现 |
|---|---:|---:|---:|
| 零命令行与可理解性 | 20 | 19 | 18 |
| Chrome平台遵循 | 15 | 15 | 14 |
| 发行ID、安全与迁移 | 20 | 18 | 17 |
| Go原生Host与安装器 | 15 | 14 | 14 |
| 原生本地项目功能 | 15 | 9 | 6 |
| 失败与生命周期恢复 | 10 | 9 | 9 |
| 独立真实交付证据 | 5 | 0 | 0 |
| 合计 | 100 | 84 | 78 |

这是R2范围的审计判断，不是整个新上游仓库评分或测试通过率。最终同候选真实Mac交付NOT_TESTED，已核验同候选原始证据覆盖0/100；不抹除历史成果，不判95+。

## 未关闭与实际流程

未获得经核验的官方Chrome Web Store稳定ID；没有账号上传授权，不上传或预留草稿、不猜ID。全新普通用户免ID自动Host登记因此尚不可交付。Go GUI当前只支持JS单文件，完整多文件/npm/HTTPS项目仍需高级MCP，不能称原生项目闭环已完成。最终App-first/Extension-first、双Profile、重启、权限拒绝/撤销、Node冲突、Controller/Page/Stop/持久Result、源码变化和资源释放均需在同一冻结候选重验；未执行GitHub CI/发布。

目标流程：安装OpenDesk → 安装扩展 → 真实点击授权连接 → 原生授权本地项目 → Sidebar刷新后明确Run。开发版当前可用已实施的开发配对入口和Go原生确认，再单独授权Native、网站、JS文件及运行类型；GUI点击路径未完成最终同候选真实验收。普通发行目标仍待官方ID及完整原生验收，不能要求普通用户查ID、装Node、配置MCP或执行setup来绕过此缺口。

最后远端观察值：Browser main b5b3ba92e74d44786f7b9b462cbb1485c0228f58；Go master c82850a80d9066c5b8a0a0ff0e4f34732c6c1e07。没有推送、自动再合并或把旧测试提升为这些远端新输入的验证。
