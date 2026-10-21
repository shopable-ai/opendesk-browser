# R1.8-WEB · 完整文章剪藏与持久资料库 · 实施/验收记录

日期：2026-10-21。基线参考 `ACCEPTANCE-R1.7.5-LOCAL.md`（1.1.4；历史 Mac Chrome PASS **不等于**本版 Chrome PASS）。

## 核心结论

旧产品不只是前端 2 KiB/8 KiB 限制，普通 Sidebar Tool Host 还有单项 8 KiB、总计 32 KiB 的硬限制。R1.8 为唯一 `web-markdown-clipper` 添加专用可信操作 `clipNotes.*`，直接复用原 Chrome storage.local 命名空间和原 `clips: {version:1,items:[...]}`，原子修改受现有每工具锁保护。未放宽任何其他工具的存储配额，也未引入第二套 Host、云服务或跨工具数据读取。

新边界：160,000 UTF-8 字节正文（包括来源格式转换所增加的 Markdown 文本），整个资料库 4 MiB 序列化 JSON，最多 1000 条；超过限制返回错误，不截断。全文按 ID 独立读取；可分页搜索；操作前后验证已有授权/身份；修改/删除检查 CAS；写入依赖现有 verified Chrome local helper；新增客户端二次全文读回；结果未知需用户显式刷新。

## 完成范围与证据等级

| 项目 | 状态 | 核查范围 |
|---|---|---|
| 专用 Host / 4 MiB / 160,000 字节 | IMPLEMENTED / LOGIC PASS | 源码及隔离 JS 运行级烟雾测试：10K、50K、100K、150K、160K 按字节写入并重读；160001 拒绝 |
| CAS 冲突与普通失败不覆写 | IMPLEMENTED / LOGIC PASS | 隔离运行级烟雾测试：过期 token 拒绝编辑，失败不改旧数据 |
| 旧 1.1.4 格式读取 | IMPLEMENTED / LOGIC PASS | 同一 `clips` schema，隔离运行级校验历史格式；未执行真实安装升级 |
| 一键保存→“我的摘录 · 数量”→全文阅读 | IMPLEMENTED / NOT_TESTED_BROWSER | 正式 HTML/JS；需 Chrome 点击读回与键盘复验 |
| 搜索/编辑/复制/下载/删除/备份 | IMPLEMENTED / NOT_TESTED_BROWSER | 源码、预览模拟、准备的 Node 自动化用例；需实物下载/剪贴板核对 |
| 预览 HTML 与正式 HTML 同源 | IMPLEMENTED / STATIC_PASS | `preview/stage.html` 嵌入完全相同的 `src/index.html` markup；读取正式 JS/CSS；模拟重开不冒称 Chrome 持久化 |
| 旧摘录及网页授权原位升级 | DESIGNED / NOT_TESTED | 不改旧命名空间或已有权限 schema；1.1.4 → 1.2.0 原位升级 Chrome 核对仍必做 |
| 完整 Node 套件 / app-ci / npm build | NOT_TESTED | 当前没有仓库脚本的本地执行证明 |
| 正式打包器 `--check-project` / 官方工具发行 | NOT_TESTED | 新 JSON 依据打包器既有规范生成；已确认旧包的源码、依赖 SHA、JSON 结构与规范逐字节相同，但 **没有实际执行原版打包器** |
| Mac Chrome 安装、真实网站、重启 | NOT_TESTED | 当前 GitHub 环境不能执行用户 Mac Chrome |
| 320/360/400/440px、200%、深浅色、ARIA | NOT_TESTED_BROWSER | 预览与 CSS 可查，需真实浏览器截图和操作 |

**证据级别声明**：STATIC_PASS / LOGIC PASS 只说明相应静态或隔离函数检查通过；这里不宣称 Node、Chrome、发布或 95+ 已通过。若本文件随源码一起提交，最终具体 Git main SHA 以提交为准，不提前填写预测值。

## 后续完成产品验收（Mac Codex）

工作目录：`/Users/shopme/Documents/workspace/opendesk-browser`；仅 `main`，先核对并拉取最新 main，不创建分支或 Worktree。

1. 重跑 `node --test examples/sidebar-tools/web-markdown-clipper/tests/*.test.mjs`，以及现有工具 Host、SDK、Markdown、安装/权限门禁；**修失败而非删测试**。
2. 运行原版 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project`。如有不一致：让 **原打包器** 从本次源码生成候选，测试后用 `--promote-from` 晋升，反复运行 `--check-project`；不可复制同版本旧包蒙混。
3. 执行 `npm run build` 和 `node scripts/app-ci.mjs build web-markdown-clipper`、`node scripts/app-ci.mjs node web-markdown-clipper` 及适用 browser/native。核对 production 产物使用新版可信 Host 和唯一正式包；所有运行输出留日志、退出码。
4. 独立 Chrome Profile 从**已真实保存内容的 1.1.4**原位升级 1.2.0；核对旧记录的 ID、标题、正文、来源、时间，旧正文授权及已有右键授权边界。不能删除重装。
5. 在真实 HTTP(S) 网页执行：文章/选区/引用/链接；保存 10/50/100/150/160 KB，全文读回 hash 一致；不完整数据不得显示成功。列表搜索/编辑/删除/备份，实物 `.md`、JSON、macOS pbpaste 比对。
6. 关闭侧栏后读回，完全正常退出 Chrome 并用**同 Profile/扩展 ID**重启再读回；另执行空间不足、回执丢失、两个窗口过期编辑和权限撤销的安全验收；保留现场截图/日志，失败必须优先修复。
7. 浅深色、320/360/400/440px、200% 缩放、键盘 tab/焦点/ARIA 审查。独立维度达到证据支持的 95 分后才宣布 RELEASE_READY。

不做云同步、备份导入、Knowledge Inbox 迁移或无关 UI 设计重做。
