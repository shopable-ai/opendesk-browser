# 网页剪藏 1.2.15 正式验收

- 任务：`OD-WEB-MARKDOWN-CLIPPER-R2-ACCEPTANCE`；分支：`main`；记录：2026-11-26（北京时间）。
- 起始源码：`b9398918dc109a4ccb934fe60828d750b5614e7e`。工具 ID：`web-markdown-clipper`。
- 结论：**进行中，尚未达到正式交付标准**。工具包的晋升与 Browser 构建、Chrome 原位更新分别验收。

工具的原有 1.2.14 JSON 来自 Git 历史，SHA-256：`1631280f614be061aa3fa97c9923478bc2e008e3933110c067ddded33dcb509f`。候选 1.2.15 由原打包器生成，通过候选测试后以 `--promote-from` 原子晋升，唯一正式 JSON 为 90,836 字节，SHA-256：`cc5f2505ce10262fabce160bdf3eec64a36f73b9e34c4e213d4a070e83990539`；`--check-project` 返回 `PROJECT_PACKAGE_MATCH`。工具包 ID、权限、SDK 和右键菜单合同保持一致。

| 条目 | 已验证 | 剩余证据 |
| --- | --- | --- |
| T1 模式与缓存 | Node：区域排第一且为默认；共享存储保留超过 32 KiB 库，写入失败后可重试，不虚报保存 | Chrome 安装、关闭/重开原生 Side Panel 及 Chrome 重启读回 |
| T2 区域识别 | ego 本地真实浏览器夹具 21 项通过；含单字、<50px、嵌套、链接、代码块、36 章长回答、滚动、动态和虚拟化节点、高亮与结果一致。另在 [W3C 公开网页](https://www.w3.org/MarkUp/Guide/) 用同源码在独立执行环境点选 H1 和一个内文链接，输出与命中一致，链接未误导航 | 普通网站的正式已安装路径、真实 ChatGPT 会话 |
| T3 替换/追加 | ego 通过 macOS Cmd 边框和加号、按键还原、取消；Node 通过替换/追加和保留原文、失败及旧回执保护 | Chrome 端到端替换、连续追加；Windows/Linux Ctrl 实机 |
| T4 编辑/数据 | Node 通过独立模式草稿、编辑保留、最新文本、来源不重复、跨网页或迟到结果保护、容量边界 | Chrome 原生撤销、粘贴、下载文件和保存读回；160,000 字节导出边界修复验证 |
| T5 摘录复制 | Node 通过按 ID 读完整正文、成功/失败反馈、保留其他错误 | Chrome Side Panel 的布局与读/删/改；操作系统剪贴板字节读回 |
| T6 构建/升级 | 项目 Node 131/131；可信来源 49/49；App CI plan、inspect、build、node 231/231；正式 JSON 晋升和嵌入包逐字节比对通过 | Chrome 原位升级实测进行中 |
| T7 缺陷与评分 | 已修复重选失败丢草稿、模式来回丢编辑、整份 Markdown 容量、滚动及动态内容过期高亮、保存与复制反馈；修复标题变动误删草稿和 160,000 字节导出失败 | 独立评分以最终实测证据为准；没有已通过 95 分门槛的结论 |

[ego 本地点选截图](evidence/1.2.15/ego-region-append.png)只展示实际浏览器中的源码夹具和 Cmd 高亮；侧边阅读目录来自该测试浏览器的现有环境。自动结果及构建原始日志保存在工作区 `artifacts/sidebar-tools/web-markdown-clipper/r2-acceptance/`。旧版本的阶段记录保留在[历史 R2 验收](region-picker-r2-acceptance.zh-CN.md)。

生产候选来自源码提交 `3cb717e4317fc2880498b723044f4e177470ad18`，产物 SHA-256 指纹为 `bf4da985fb5f62787846ce9bff573cb5c747676e552b21f2aa539615f4745919`。首次构建暴露工具壳超过预算；将原有 AI Proxy 可信样式原样移到原包内的独立样式文件，预算和 CSP 不变。复建通过，`ui/tool-shell.js` 从 3,245,465 降至 3,094,448 字节，低于 3,145,728 字节上限。生产候选已包含固定 Page Relay、Sidebar Host 和 Service Worker。详见[固定资源指纹与构建回执摘录](evidence/1.2.15/build-receipts.json)。

直接重建 `b9398918d^` 历史源码也触发同一个体积门槛。Chrome 升级验收改用匹配原验证回执的旧版 Browser 二进制（指纹 `5f749138021a7a143fab070fbb0b69f42581ccd570efaab5e913bb02a12ca2a7`）；它内嵌剪藏 1.2.10，测试先用正常安装审阅导入原 1.2.14 正式包，再创建和核对既有数据。这个基线是历史可核验产物，未改写其字节或用放宽预算绕过旧构建。
