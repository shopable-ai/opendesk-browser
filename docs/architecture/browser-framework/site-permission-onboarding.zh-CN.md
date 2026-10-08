# OpenDesk Browser 网站权限：一次集中授权与逐站模式

## 解决的用户问题

过去每次运行草稿、创建健康检查页和安装独立 SDK 时，用户界面都可能触发 `chrome.permissions.request`。对已批准的同一来源，Chrome 通常不会再弹窗；但新来源、独立测试 Profile 和此前未获准的 Cookie/通知等权限仍可能反复打断调试。

## 权限方案（Browser First）

- 正式 `manifest.json` 保持 `optional_host_permissions: ["http://*/*","https://*/*"]`，不默认获取全网网站权限，也不新增常驻本地许可库。
- Sidebar 主界面提供“网站权限 → 开发者设置：一次性集中授权”。用户在真实点击中一次调用 `chrome.permissions.request({origins:["http://*/*","https://*/*"],permissions?:["cookies","notifications"]})`，后两项需明确勾选。
- Chrome 原生权限本身由浏览器保留，重启后通常仍有效；点击按钮不会直接执行脚本。界面从 `chrome.permissions.contains` 查询全网范围、Cookie、通知的实际状态，并监听 `permissions.onAdded/onRemoved`。从不以本地存储标志模拟批准或撤销。
- 仍支持较低权限的逐站模式。现有 `script-editor.js`、`sdk-approval.js` 与健康检查入口不改动可信点击顺序、目标验证及执行栅栏：一旦 Chrome 已有相应可选权限，再请求相同权限应无需新弹窗；没有所需授权时继续由 Chrome 询问。
- 浏览器原生网站访问权限与 OpenDesk 应用级授权是两个不同层级。现有 RunHost/Controller 的 run/document/owner 绑定、SDK 每个文档独立的能力与目标 origin 范围、Worker 重启/撤权后的再核验必须保留，不能因全网权限自动信任任意网页或直接安装 SDK。
- `chrome://`、Chrome Web Store 等浏览器受限页面，以及 `file://`、隐身和 Chrome 自身的“允许运行用户脚本”等独立设置，不会被全网 HTTP(S) 许可绕过。若 Chrome 配置被清空、换新的 profile、使用者撤权或新增原先未选择的可选权限，仍需要重新批准。

## 验收边界

定向单测：`node --test tests/environment/site-access.test.mjs tests/environment/sidebar-product-contract.test.mjs tests/environment/script-editor.test.mjs tests/framework/k2-sdk-ui-approval.test.mjs`。

在真实 Chrome Side Panel 内另行验证：新 Profile 首次点击显示一次全网站访问授权弹窗；之后切换多个普通 HTTPS 和 HTTP 网站并重复运行草稿无新的 host 授权弹窗；重启 Chrome 后状态保持；撤销全网授权后界面更新且需要重新获得原生授权。上述 Native 项目在缺少 Mac/CFT 运行环境时必须记录为 `NOT_TESTED`，不得以单测代替。

## Codex 日常调试：保留授权但不污染原生验收

已核实仓库的 `tests/framework/k5-sdk-native-launcher.mjs` 和 `tests/framework/b05-product-acceptance-20261003.mjs` **强制每轮使用新建 `codex-cft-*` Profile**。在这种模式下重复弹授权是预期现象，不能通过修改应用级 SDK 授权解决。原生验收仍需独立的洁净 Profile 和真实授权动作。

日常交互开发请在**同一个固定 worktree 目录**运行：

```bash
npm run build:dev
npm run dev:chrome
```

`dev:chrome` 使用已缓存的 macOS Chrome for Testing 155（可通过 `OPENDESK_CFT_VERSION=138` 选 138）；若在独立 worktree 中缺少缓存，可明确指定 `OPENDESK_CFT_CACHE_ROOT=/原工作区/tests/.cache/m5-browsers` 复用同一组**受控 CFT 二进制**（绝不复制个人 Chrome Profile）。它加载当前工作区固定的 `dist/development` 路径，把浏览器数据保存在用户目录下 `~/.opendesk-browser/dev-profiles/primary-<worktree hash>`，并校验目录所有权和私有权限；不使用个人 Chrome Profile、不删除这个开发 Profile、不自动授予网站权限。不同 worktree 和 `OPENDESK_DEV_PROFILE` 名称隔离。

首次在这个真实 Chrome Profile 里，手动确认全网 HTTP/HTTPS 授权；在 Chrome 138+ 的扩展详情中另行开启“允许运行用户脚本”。之后请关闭测试浏览器，再用**完全相同**的 worktree 路径和命令重启，检查 `chrome.runtime.id` 不变、`chrome.permissions.getAll()` 与 `chrome.permissions.contains({origins:['http://*/*','https://*/*']})` 依然显示浏览器授权。重新编译后直接在 `chrome://extensions` 点击“重新加载扩展”；不要反复删除/新装或切换扩展目录。

正式验收时仍从原来的 native 启动器新建一次性 Profile，完成首次授权 → 多次操作 → 同 Profile 重启 → 撤权验证；不能把持久调试 Profile 的结果当作全新安装验收，也不能使用模拟权限或 CDP 直接授予权限冒充真实点击。Codex 必须标明两种验证等级，不能把 `dev:chrome` 的结果记作 F3 PASS。
