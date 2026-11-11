# 自由复制 · Free Copy

OpenDesk Browser 中的独立 Sidebar Tool + 受管 Page USER_SCRIPT（不是第二个 Chrome 扩展）。

## 用户体验

- 完成安装及网页范围审阅后默认开启；在侧边栏中可一键暂停/恢复。
- “在当前网站启用”只修改该 HTTP(S) origin 的例外，不影响其他站点。
- 恢复静态网页文本选择、原生右键菜单、Ctrl+C / Cmd+C 和原生复制结果。站点的普通 `copy`、`selectstart`、`contextmenu`、快捷键处理不能覆盖这些动作（受浏览器事件注册顺序约束）。
- 不读取、保存或发送选中文字，不读写系统剪贴板，不访问网络、不请求原生 Tab/剪贴板权限。
- 暂停时移除本工具注入的样式；事件监听在受管 Page 生命周期结束时清理。轮询私有设置用于侧栏关闭后、其他网页标签页的设置收敛，约 1.2s；失败安全停用。

## 兼容和边界

- 仅普通已授权 HTTP(S) 顶层网页；不能覆盖受限浏览器页面、浏览器内置 PDF、未授权 iframe、Canvas/图片文字或没有加载的内容。
- 避开输入框、富文本编辑器、按钮、拖动控件等交互区域，不强行覆盖表单、网站自定义编辑器的复制行为。
- 对网页已早于本模块注册的 window capture 监听、`mousedown.preventDefault`、Shadow DOM、虚拟化内容无法保证全部解除；后续可考虑仅在用户授权的网站提供增强兼容模式。
- 鼠标手势若已识别 56px 右拖，则让该次右键事件继续到鼠标手势模块；Chrome/macOS 若在鼠标移动前弹出原生菜单，仍需真实 Chrome 验证时序，不能凭 Node 测试保证共存。
- 软件只恢复浏览器已呈现网页的常规复制；不用于绕过登录/付费访问、DRM 或下载限制。

## 归属及运行

- `tool.config.json` 与 `package.json` 共同声明应用 ID `free-copy` / `app.free-copy`，项目唯一入口 `src/page/main.js`，父工具持有 `storage.local` 和 `currentPage.read`。
- 复用仓库原 Sidebar Tool v2 组合包构建器、现有安装审阅、Page Authority 和私有 CAS 设置，不新增 Browser 宿主权限及特殊安装器。
- 按现有规范先运行本项目的 `node --test projects/free-copy/tests/*.test.mjs` 及 `node --check`，再由原打包器生成临时候选并通过包测试后晋升唯一正式包 `projects/free-copy/free-copy.opendesk-tool.json`；未实际安装 Chrome 时标记 NOT_TESTED。

功能范围：P0 开关、选择/复制/右键恢复；P1 站点例外已实现。OCR、图片、PDF、跨 iframe、强制复制按钮及剪贴板历史不属于首版。
