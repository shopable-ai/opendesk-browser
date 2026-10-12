# Sidebar R26：工具间距统一与网页笔记布局修复

日期：2026-10-12。目标：`shopable-ai/opendesk-browser`，只修改 `main`。

## 现状与根因

- 宿主 `#workspace-content` 左右留白 11px（≤340px 为 9px）与已预装沙箱工具 `.notes-app{padding:12px}` 叠加，导致网页笔记正文和工具详情标题没有对齐。
- **网页笔记原 CSS 已使用 `body{margin:0}`**，不能把其问题归因于浏览器 body 的默认 margin。
- 其 UI 局部使用 2/5/6/7/10px 等细碎间距，缺乏统一规格；网页工具的空态还暴露过多安装架构细节。
- 保留浏览器 sandbox、工具数据、SDK、权限及安装策略，不创建第二套正式设计系统。

## 变更

- `src/ui/design-tokens.css`：补充单一宿主横向 gutter。
- `src/ui/tool-shell.css`：详情 iframe 负向抵消宿主 gutter，避免双层内容缩进；统一网页工具卡片等间距。
- `examples/sidebar-tools/quick-notes/src/style.css`：映射 4/8/12/16px、8/12px 圆角和 34px 按钮；优化笔记输入、附注、操作区、折叠区域及窄屏。工具版本改为 1.1.6，需用户显式确认更新。
- `src/ui/installed-page-tools.js`：简短空态，源码 SHA 折叠到「技术信息」；不会改动 Page Installed 权威数据。
- `src/ui/sidebar-tools.js`：关闭工具返回列表时清除与当前工具相关的过期提示。
- `docs/architecture/sidebar-design-system-r20.zh-CN.md`：补充唯一正式规范；`tests/environment/sidebar-tool-spacing-contract.test.mjs`：新增静态合同回归。

## 验收和风险声明

- 已编写静态合同测试，需在完整本地仓库执行：`node --test tests/environment/sidebar-tool-spacing-contract.test.mjs tests/environment/sidebar-quick-notes.test.mjs tests/environment/sidebar-r21-design-system.test.mjs`。
- 源码候选需按 `docs/framework/testing-guide.md` 做增量影响核对，运行 `npm run check`、必要的生产/开发构建及 `npm run verify`；不能把历史候选 PASS 直接移植到新候选。
- Mac Chrome：320/360/420/520px，125%/200% 缩放，长标题/长 URL，Side Panel 工具列表→网页笔记→返回以及技术信息折叠、安装更新。**无当前源码绑定的原生证据；状态 `NOT_TESTED`。**
- 本轮未接触任何本地 Mac Chrome profile、固定端口、dist/ZIP、历史回执或全局 owner 账本。
