# AI 消息发送队列 · R5.8

单产品根目录：`examples/sidebar-tools/ai-send-queue/`。一个 Page 内存队列引擎、两个受信操作界面，不复制业务源码。

- `src/page/`：Page Program，ID `opendesk.ai-send-queue`，保留原 FIFO、安全栅栏、原生草稿/IME、皇冠和逐条暂停。
- `src/sidebar/`：正式 React 19 + Shared UI，Tool ID `ai-send-queue`，只通过已有 Side Panel Host 与 Page Authority 读取和执行。
- `src/shared/`：产品消息契约；Host 仍独立对授权和输入执行严格校验。
- `assets/`：正式 `crown-premium.webp` + `queue.css`；R5.4 坐标、尺寸、旋转原样锁定。
- `preview/index.html`：唯一历史设计评审页，离线演示不等于安装或真实双端功能。
- `legacy/`：原 0.1.12/r11 Page 包、旧 ID 包与 R5.3 皇冠调参 HTML 历史存档，正式产品中不再提供坐标调节入口；均不自动升级或迁移。

### 当前交付边界

`0.1.13/r12` 是官方 **blocked 候选**。源码结构完成不代表两份正式安装包已生成，也不代表 Mac Chrome 操作通过。

本地验证建议（于仓库根目录、最新 main）：

```bash
node --test examples/sidebar-tools/ai-send-queue/tests/*.test.mjs
node scripts/validate-program-project.mjs examples/sidebar-tools/ai-send-queue
npm run --prefix examples/sidebar-tools/ai-send-queue build
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-send-queue --out /tmp/ai-send-queue.opendesk-tool.json
npm run build:program -- examples/sidebar-tools/ai-send-queue --out /tmp/ai-send-queue-build
node examples/sidebar-tools/ai-send-queue/scripts/sync-crown-preview.mjs --check
```

两份候选必须分别经过既有安装/权限流程，单一扩展中心安装管理入口及 Chrome 实际联调仍未验收。
