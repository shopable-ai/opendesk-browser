# 阅读目录 R4.2：网页悬浮位置、磁吸与记忆

日期：2026-10-11。目标分支：`main`。续接已经实现并交付原生 Ubuntu Chrome 证据的 R4.1 工具安装与目录阅读闭环，不创建第二套工具系统或 Markdown 索引器。

## 本轮改变和边界

- `src/reading-toc/placement.js`：可单测的 viewport/比例坐标、左右边缘 32px 可选择磁吸、8px 安全间距、无效持久数据拒绝。小视口和面板内容变化时重新校准。
- `src/reading-toc/view.js`：六点手柄支持 Pointer Events + capture（触控/鼠标/笔），不把整个目录设为可拖动；独立“归位”按钮；键盘方向键、Shift 加速和 Home 归位；闭合 Shadow DOM，不向网页注入脚本或解析页面文字为 HTML；ResizeObserver + window/visualViewport 变化重排；dispose 释放监听。
- `src/reading-toc/page.js` 与 `policy.js`：只由可信 content script 读写 `chrome.storage.local`，键为 `opendesk.sidebar-tools.toc-placement.v1:` 加编码后的精确 HTTP(S) Origin；仅拖动结束、键盘移动、显式归位时写入。每站点独立，同站多标签使用最后一次完成的用户操作，Chrome 重启和刷新恢复。无网页正文/标题/完整 URL 存储；非法位置安全忽略。
- `src/ui/sidebar-tools.js`：官方工具卸载时在撤权后额外尝试清理位置键。撤销单站点授权/暂时停用不删除用户布局偏好；工具关闭仍销毁页内视图和监听。
- 目录来源、H1-H6 索引、多回答边界、章节点击定位、Side Panel 沙箱权限及 v1 JSON 包格式不变。不做强制靠边、不增加在线市场/权限，也不把网站 JS 当作执行源。

## 质量与验证

新的 `tests/environment/reading-toc-placement-r42.test.mjs` 覆盖：输入验证、边界几何、宽度变化、磁吸与自由位置、按 Origin 隔离、Pointer Events 拖动、落点写入次数、键盘移动、归位清除、取消拖动与视图销毁。现有 `tests/framework/reading-toc-native-r41.test.mjs` 加真实 CDP 鼠标拖动、重载恢复、自由位置、缩小视口、归位清理和截图，复用真实正式扩展安装链路。`.github/workflows/reading-toc-r41.yml` 继续作为专用 CI；不重建另一个自动化基础设施。

浏览器/CI 命令（仅在源代码安全、独立测试资源可用时运行）：

```sh
node --test tests/environment/reading-toc-placement-r42.test.mjs tests/environment/reading-toc-r41.test.mjs tests/environment/reading-toc-lifecycle-r41.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
# 使用隔离 Chrome for Testing profile，先构建生产候选
xvfb-run -a node --test tests/framework/reading-toc-native-r41.test.mjs
```

### 证据状态与不可冒充项

- R4.1 历史 Ubuntu Chrome 证据仍绑定 `d848faa41da2d506b3cb5e80b5e24070a1292b84`，不可直接作为 R4.2 修改后候选的原生 PASS。
- 本轮在独立执行环境中使用 V8 对几何模块及受控假 DOM 的指针事件进行语法/行为烟测，**不等同于 Node 自动测试、正式 Chrome 或用户 Mac 验收**。
- 具体当前 `main` SHA、CI run ID、通过/失败原始记录必须以 GitHub Actions 实际运行结果补入，不能未执行先宣称 PASS。
- 当前用户 Mac 隔离 CFT、真实已登录 ChatGPT 与知乎、极端窄屏/200% Zoom 以及整体项目 F3/ZIP：`NOT_TESTED` 或依赖现有各自工作流，绝不合并为本轮 R4.2 PASS。

## Mac 手工验收操作

核对 `main`、HEAD、未提交修改和测试资源占用；安全时才 `git fetch origin main` 并快进。使用项目认可的隔离 Chrome for Testing Profile 加载此候选 `dist/production`，实际在 Side Panel 安装内置阅读目录、批准站点。普通文章页观察初始右上/窄屏响应式位置 → 拖动手柄到左边（磁吸）→ 拖到中间（自由）→ 刷新文章 → 同源第二篇 → 浏览器重启 → 切到另一未授权来源 → 窄屏/缩放/高度变化 → 归位后刷新 → 键盘上下左右/Shift/Home → 点击标题跳转与滚动跟踪 → 关闭侧栏 → 撤权/重授权 → 卸载。记录实际包 SHA、安装目录、扩展 ID、截图、控制台、chrome.storage 的偏好键、回归结果和 FAIL/NOT_TESTED 清单。不要复用或删除其他 Agent Profile 与原始证据。

质量目标单项视觉/交互/安全/可靠性/可访问性力争 ≥95/100，必须绑定本轮真实验收证据；当前不声明已达标。
