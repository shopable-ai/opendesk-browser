# 扩展网页提示演示

这是 Page USER_SCRIPT 教学项目，复用公共 `createPageUI` / `ui.toast`，没有独立测试 HTML、网站业务、网络请求或特权桥。用户在扩展里明确运行后，当前已授权网站出现标有「OpenDesk 扩展」的演示面板，可选九个位置、四种类型、1～10 秒时长和纯文本内容。关闭演示同时清理提示与受管事件；导航后不会自动运行。

实际入口优先使用「开发 → 本地项目」连接此目录并点击运行。也可通过现有构建器生成固定源码，再在「开发 → JavaScript → Page · 网页 DOM」中粘贴 `program.js`、点击运行；无需网页配合或添加 HTML。构建命令在仓库根运行：

```sh
node scripts/validate-program-project.mjs examples/programs/page-toast-demo
node scripts/build-program-project.mjs examples/programs/page-toast-demo --out artifacts/programs/page-toast-demo
```

该命令只构建本示例，不重建 Browser。`pageRules.matches` 表示可适用的网站范围，不授予 Chrome 网站权限，也不代表已经安装或自动运行。受限页面和缺失网站权限继续由原扩展入口拒绝。切换到另一个网站后，需要再次明确运行。

示例的面板只负责调用公共 API；框架源码仍唯一归属 `src/scripting/user-scripts/page-toast.js`。正式视频消费者保持顶部居中反馈，不加入演示控件。API 与隔离边界见 [Page UI 文档](../../../docs/framework/ui-api.zh-CN.md)。

2026-10-30：源码校验、原构建器编译及编译产物的独立 DOM 操作通过（九位置、四类型、全部时长、纯文本、自动消失和关闭清理）；原生 USER_SCRIPT 入口未运行。真实扩展在 W3Schools/W3C 上触发提示的证据来自视频倍速消费者，不冒充本示例的原生运行证明。
