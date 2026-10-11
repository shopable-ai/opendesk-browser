# R15.9 公共第三方库：实施状态、源码修复和工程验收阻断

日期：2026-10-11。仓库：https://github.com/shopable-ai/opendesk-browser

## 执行边界

本对话通过 GitHub Connector 对真实 main 进行 Git Data 原子提交，HEAD 竞争时用快进约束，未接触用户 Mac 本地工作区、Chrome Profile、dist 或 ZIP。旧工作流/其他 Agent 改动均保留。以下不是宣称最终工程验收。

## 已实现源码（与验证等级分开）

- 默认：Lodash 审核 8 API、Day.js 含 duration/UTC/timezone/严格解析；保留项目自有 my-utils ABI。
- Page USER_SCRIPT 可选：jQuery 既存 vendor、js-cookie 3.0.8、CryptoJS 4.2.0（受限兼容 API）、FileSaver 2.0.5（Blob/File 与文件名检查）。
- Page frameworks：React 19.2.0 含 ReactDOM、Vue 3.5.22 复用 page-frameworks 已固定资产，禁止重复打包。
- Axios 当前仅存在 src/libs/adapters/axios-transport.js 的受限传输适配器，未有完整真实 axios npm 包与 Runner 接线，不能对用户承诺 axios.create/interceptors 可调用。

## 本轮已安全提交的关键修复

- a42819caf9dc936796989dd4d5e70ae8ab2390cb：真实 crypto-js@4.2.0 Page opt-in 入口、固定资源/许可证、ABI 与测试。
- 981b7c700b9d7a56c6df6dbf8517a1e607eb55b6：修复 CFT 夹具固定资源未同步。
- 2a1677fc9df98284580aab4eb9230816bb455128：真实 file-saver@2.0.5 Page Blob-only opt-in 与测试。
- 3f241d73e9f9af858f9618c5acce3a898a3c4d3c：Mac Chrome 临时 Profile 清理竞态定向修复。
- 888e56acd3fef2f6a542d6ba509ac5f9846aa9f3：四个同扩展 SW 固定资源安全扫描许可、真实启动资源统计与负向测试。
- dcbcb5c3e04e1155674c4abde49bf1c3396a686e：仅对固定 CryptoJS CJS 包中 Reflect.construct 的已审查第三实参 this.constructor AST 模式加以区分，保留任意 eval/Function/constructor 链拒绝及对应负向测试。
- 与本轮并行的健康检查提取：现有 agents/health-host.js 已由其他作者接入 src/sw.js，本文只复用，不重复覆写。

## CI 可核对阻断和证据

- bcc930862e6e617efc287aee4e3c396399ebcc64：生产 sw.js=328457 B，超过 327680 B 硬限 777 B，R15 生产构建失败（run 38142184951）。
- 更新主干后生产 SW 已走到生成包扫描，出现 crypto-js WXT CommonJS 构造助手 AST 被拒绝（run 38143037031）；本轮 dcbcb5c 定向处理，仍必须核查新 commit 的 CI，而非认定已通过。
- 先前某个 Mac CFT 候选确认 Controller/Page 默认内置库和 WEBSITE MAIN 隔离成功；该记录不能代替当前完整公共库矩阵，也不能代替 FileSaver 的实际用户下载回执。
- 原生 Mac Chrome 新候选、FileSaver 实际下载、CryptoJS 的生产包、完整 Axios Broker 取消/timeout/拦截器、全部公共库同 SHA ZIP：未获得同候选 PASS 时一律 NATIVE_UNVERIFIED/NOT_VERIFIED。

## 尚未实现的公共目标（不可计入已交付）

真实 Axios（含 create/interceptors、最终 URL 授权、取消传递）；query-string；store.js（同步 API 与隔离持久后端）；Cheerio 浏览器 load；FingerprintJS 隐私/许可证与显式操作；Socket.IO Client 真实连接与停止后无重连；Tailwind 用户工具作用域静态样式。依赖仅可来自经核准 npm lock 且配套 WXT 资源、许可、SHA、世界与用户调用测试。

## 真正的完成门槛

逐库：package-lock 精确固定和真实 npm integrity、合规许可证、单一 Catalog/ABI、正式 WXT 产物/manifest SHA、真实世界可调用、错误与权限撤销、隔离/停止/刷新场景。全局：source check、生产/开发 build、strict libs:doctor、全测试、包体积 327680B gate、verify、pack/pack:dev 和同 SHA Mac Chrome + ZIP 验收。禁止静默放宽限制、修改测试分母或把 Design 96 分当成工程通过。

结论：**PARTIAL_IMPLEMENTATION / FINAL_NOT_ACCEPTED**。未完成全部目标前不输出“仅剩本地 Codex 验收”的虚假提示词。
