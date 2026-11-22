# AI Job Auto Apply · AI 自动求职（R3 源码增强，沿用 R1/R2 身份）

项目 owner：projects/job-auto-apply/；产品 ID：job-auto-apply；当前目标站点：BOSS 直聘（www.zhipin.com）。
工作分支：main。当前源码版本 0.1.1、Page revision 2。状态：R3_SOURCE_UPDATED / V8_SMOKE_PASS / APP_CI_BUILD_PASS / NODE_PASS。GitHub App CI 于提交 f539b1e379fc2dbd30d2a1f5d41acd811c093309 生成 0.1.1 同源候选包（SHA-256：37a1873ad220ca5ca1ceb79859475a2595a0c2896cdcd678c5556cf43a21862a，52,321 字节），60 项 Node 测试全通过；尚未晋升正式包、未安装、未在真实 Chrome/BOSS 页面验收。后续只改动测试夹具并已恢复至通过时的内容，最新 HEAD 对应 CI 需单独读回。

## 解决什么问题

把“打开职位 → 阅读要求 → 过滤不合适的岗位 → 判断自己是否匹配 → 准备有针对性的沟通”从重复手工整理改成可解释、可审核的流程。初版不做全自动海投或绕过网站限制。

首个真实链路：用户已登录 BOSS 并打开职位列表 → 明确授权安装组合应用 → 在侧栏点击“扫描当前页面” → 已安装 Page 模块仅读取当前 DOM 已加载卡片 → 侧栏用本地规则排序、显示理由 → 手动加入待审核清单 → 打开沟通草稿，人工核对后复制。**没有任何自动点击“立即沟通”、发送消息、投简历或切换职位页的代码。**

如果未安装/未授权/页面已切换/页面改版，必须保守失败，不显示伪造岗位/成功投递。

## 命名与搜索词（R2 决定）

- **英文正式名称**：AI Job Auto Apply。**中文展示/检索概念**：AI 自动求职。
- **唯一稳定技术 ID 与项目 owner**：`job-auto-apply` / `projects/job-auto-apply/`，对应 Page 模块 `app.job-auto-apply`。不要同时维护 `job-assistant` 副本。
- **最重要的核心短语**：`Job Auto Apply`、`Auto Apply`、`AI Job`。BOSS 地区需求词为“BOSS直聘求职”“BOSS直聘自动投递”“岗位匹配”。`AutoJob` 可以做用户搜索别名，但不是本项目的规范 ID。
- **当前产品实际能力**：BOSS 当前 DOM 只读扫描、确定性匹配排序、待审清单和沟通草稿复制；未接入 AI 语义推理、未发送/投递/上传。含“AI”“Auto Apply”的名称是长期产品定位，正式页面描述必须标明当前能力，不能宣称自动投递已经上线。
- **SEO 边界**：OpenDesk 内部扩展检索是否索引 description/别名，要以实际内置检索实现为证据；目录名/应用 ID 本身不会让 Google 自动收录。外部搜索需要有可索引的产品落地页，配合真实功能介绍和合理标题，不靠无关堆砌。当前只改应用自身配置与源码，不改框架或新增未经验证的别名字段。
- **改名时机**：上一轮虽已创建 R1 源码，但没有正式安装包与真实用户数据，所以现在统一 ID 不需要设计数据迁移；若日后出现已安装身份，改 ID 则必须走专门迁移，不能当作普通改标题。

## R3 已落实的差量能力与限制

- BOSS 职位 ID 移除 URL 的 .html 后缀及查询串影响；历史队列 ID 在内存中兼容。缺少稳定 ID 的卡片仅可阅读，不能加入待审。
- 用户主动扫描时仅短暂等待异步 DOM（最长 1.4 秒）；页面或权限变化时拒绝旧请求，不自动翻页或发信。
- 读取卡片中的经验、学历、招聘者和可见活跃信息；显式已沟通/猎头标记支持过滤。未识别字段与完整 JD 均标为待核实。
- 规则匹配不是 AI；新用户默认不填写技能，默认草稿不虚构项目经验。
- 待审队列保留 CAS 校验；写入未知时锁定本会话后续写入，满额不会静默删除历史岗位。
- AI 简历匹配、真实发送、执行队列、暂停恢复、真实投递记录、图片简历与多平台仍未实现。

可追溯的功能差距与源码依据统一维护在 REQUIREMENTS.zh-CN.md 的 R3 章节，不另建竞争性需求文件。

## 从哪些开源项目汲取设计思路

- Get Jobs / 工作无忧：https://github.com/loks666/get_jobs （已核实当前源码中的 Boss.java、BossChatNavigator.java、Locators.java、AiService.java、BossJobService.java、front/app/boss/page.tsx；现行 LICENSE 为 PolyForm Noncommercial 1.0.0，不复制其源码到商业产品）
- Python GetJobs：https://github.com/vvvsrx/get_jobs （架构参考，不作为运行依赖）
- AutoCast-Boss海投助手：https://github.com/gstranded/autocast-boss-assistant （职位筛选、去重、回执/暂停；MIT；仅作为对照）
- BossAutoApply：https://github.com/FanzhiZeng/BossAutoApply （轻量 Manifest V3 的 content/background 分工；MIT）
- boss-zhipin-helper：https://github.com/ConsoleSun/boss-zhipin-helper （DOM 监听、简历信息、AI 草稿；MIT）
- smart-job：https://github.com/DINQ-labs/smart-job （多平台 adapter 和 Agent 规划；MIT）
- joohw/boss-cli 等 HR 端自动招聘项目不是求职者端实现，不直接复用。

本项目新写原始代码，不复制第三方源文件。任何未来导入第三方代码需记录 LICENSE、来源版本与修改范围。

## 目录与权限边界

- tool.config.json：v2 Sidebar Tool；storage.local、page.module、user.export；同一项目打包。
- package.json：app.job-auto-apply 的 page-userscript 源，授权范围仅 www.zhipin.com；顶层 USER_SCRIPT。
- src/page/main.js：通过 OpenDeskAppPage 接收 jobs.scan；**只读已加载 DOM**，不给侧栏暴露任意脚本执行接口。
- src/main.js：侧栏偏好、规则匹配、待审清单、人工编辑草稿与复制；通过原 OpenDeskTool.request 调用，不使用 chrome.* 或任意网络请求。
- src/index.html + style.css：Side Panel 紧凑界面；复用主宿主 od-* 样式。
- REQUIREMENTS.zh-CN.md：需求树、验收与后续安全门禁。

OpenDesk 公开试点：docs/api/sidebar-tool-page-module.zh-CN.md。暂不改 Browser Framework 的 src/、manifest、Catalog、全局 SDK。Page API 和用户授权的真实可用性须本机验收，不能据源码推断正式可用。

## 开发与验证

在仓库根目录按既有命令构建到忽略的候选路径，不直接生成正式包：

    node scripts/build-sidebar-tool.mjs projects/job-auto-apply --out artifacts/sidebar-tools/job-auto-apply/candidate.opendesk-tool.json

先执行 JavaScript 语法/定向构建与页面 fixture 测试，再在已授权的真实 Chrome 上安装候选、刷新 BOSS 搜索列表，核对 Page module 的扫描结果。确认稳定才按既有打包 Skill 晋升唯一 job-auto-apply.opendesk-tool.json；不要因本说明直接认定安装已完成。

**已知未完成**：真实 BOSS DOM 选择器覆盖验证、登录及授权实测、动态页面长时间稳定性、AI 简历语义匹配、正式任务执行/Stop/回执、跨网站适配、跨页历史聊天核验、运行队列与简历上传。这些不得标为 PASS。自动发送和账号限制处理属于下一阶段独立审查。
