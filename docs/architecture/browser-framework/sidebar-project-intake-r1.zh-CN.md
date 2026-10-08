# Sidebar 多文件目录、ZIP 与资源接入架构 R1

> 2026-10-09。**本文件是待开发的产品/技术合同，不是已实现功能声明。** 当前 Sidebar 完整目录接受 .js 草稿、Task 包 JSON 以及 `program.opendesk-draft.json`（冻结执行字节和只读多文件源码快照）；**尚不能直接把原始文件夹当作可构建安装的项目**。资源源文件可声明哈希，但构建明确拒绝。

## 产品目标

保留 Sidebar R6 的「我的任务 / 发现 / 开发」三个一级页签，以及底栏「运行草稿 / 保存版本 / 停止」。复杂项目不塞进小型侧栏；在「发现 → 导入」打开的**独立全页任务目录**增加一个“选择项目文件夹”入口。

```text
用户主动选择源码文件夹
  → 只读枚举文件及相对路径
  → 元信息/路径/体积/类型校验
  → 可信本地构建器（当前尚需用户通过 CLI 运行）
  → 固定 program.js / artifact.json / 资源哈希
  → 同窗口 Sidebar 草稿或原 Task Candidate
  → 明确授权与用户点击
  → 原有 USER_SCRIPT 或 Controller/RunHost
  → 实际 Chrome 回执、运行结果与类型专属安装门槛
```

源项目、构建产物、验证候选、可安装状态、已安装状态必须分别显示；任何代码编辑都要求重新构建，不准悄悄改写冻结执行 JS。main 已集成 PR #22/#23 的源码快照与执行字节隔离成果，应在其上实现文件夹读取，不再重复开发。

## 文件夹读取的可行方案

Chrome 扩展页面内可以在用户点击中使用 `<input type="file" webkitdirectory multiple>` 获取各个 `File` 及 `webkitRelativePath`（需做浏览器兼容检查）；若以后采用 File System Access API，也必须保留权限与回退方案。**选择文件夹不要求 Native Messaging、无需全磁盘读取权限，也不等于浏览器有 npm 构建环境**。

将传入的路径先剥离同一个被选根目录，再进行统一规则校验：禁止空路径、绝对路径、`..`、反斜线、重复/Unicode/大小写碰撞、超出根目录、异常文件数或字节量；默认排除 `.git`、`node_modules`、`.env`、凭据、隐藏敏感文件、可执行脚本和未知二进制。复用 `validate-program-project.mjs` 的 ESM/资产预算及权限 Schema；浏览器选择器不能信任文件后缀就执行代码，也不执行项目 `scripts`、Webpack 配置或未审批的 npm 安装钩子。

首次产品切片只允许**导入/查看/提示如何构建**，不能提供一键「安装成功」的假结果。实现真正受信任的文件夹构建须另行核对本地编译服务、输出 hash、同窗口 Sidebar 消息边界与失败语义。

ZIP 作为第二阶段入口，解压后走相同的路径/哈希/Schema 校验，并独立限制文件数量、展开字节、压缩比、ZIP slip、嵌套 ZIP 与链接/设备条目。不建立第二套信任逻辑。

## CSS / JSON / 图片的运行架构

现有 `opendesk.assets` 只做静态 SHA-256 校验：css (.css)、json (.json)、image (.png/.jpg/.jpeg/.webp)，最多 32 项、每项不超过 1 MiB；`scripts/build-program-project.mjs` 对非空列表强制 `E_PROJECT_ASSET_BUILD`。 [真实资产 Demo](../../../examples/programs/sidebar-assets-contract/) 固定这个不可绕过的负向测试。

后续技术必须满足：

1. **解析/冻结**：校验文件类型及真实字节（对图片额外验证 Magic Bytes/MIME），把路径/哈希/大小与 Program ID、版本及执行 JS 哈希绑定，生成不可变、可恢复的资源清单。
2. **使用/隔离**：CSS 只有在获批网页世界才注入；JSON 是数据不可 eval；图片使用受控 Blob 或扩展资源 URL 生命周期，明确 CSP 与 `web_accessible_resources` 暴露策略，不开全域任意资源路径。
3. **限制/回收**：遵守资源与 JS 体积预算，不把所有图都 Base64 拼到 `program.js`；导航、撤权、Stop、升级、重启与旧版资源共存时明确清理与校验。
4. **验证**：资源缺失/篡改/错误 MIME/过大/跨域访问均失败关闭；真实 Chrome 中分别观察 CSS 生效、JSON 数据读取与图片加载。未得到原生回执前不要标为 AVAILABLE。

不扩大为通用 CDN 脚本加载器、新 JavaScript VM、插件市场或浏览器内 IDE。

## Codex、权限与实施顺序

**本地 Codex 修改工作区文件**不等于**浏览器插件获得目录文件写权限**。初期按 [Program API](../../framework/sidebar-project-api-r1.zh-CN.md) 在本地校验/构建，并手动向 Sidebar 转交冻结 JS。Native Agent Bridge PR #11 代码已经合入 main，但真实 Mac Chrome/Codex E2E 仍要按同一候选的认证 Host、Authority 和 RunHost 回执验收；不得把代码已合入误写成任意文件系统读写或未审批 shell 权限。

实施优先级：

- P0：让两个多文件 Demo 本地构建、原导入路径和真实 Chrome 执行闭环可追溯。
- P1：独立任务目录支持文件夹只读导入、路径校验与项目摘要；无法受信构建时给正确引导，不做假安装。
- P2：CSS/JSON/图片资源打包与真实 Chrome 加载；把目前拒绝测试升级为含授权/哈希/撤权的正负测试。
- P3：复用已安全集成的 Native/Codex 接口，达到基于同一 SHA 的源码编辑 → 构建 → 浏览器执行 → 结果闭环。

验收必须区分 `SOURCE_CONFIRMED`、`NODE_VERIFIED`、`BUILD_VERIFIED`、`CHROME_REAL_VERIFIED`、`CODEX_E2E_VERIFIED` 和 `NOT_TESTED`；不得把建议中的文件夹选择功能写成已安装。
