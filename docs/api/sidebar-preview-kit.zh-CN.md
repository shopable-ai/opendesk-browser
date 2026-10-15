# 扩展应用 HTML 预览套件 R1

目标：ChatGPT 网页生成的工具设计稿沿用 OpenDesk 的按钮、表单、标题和状态语义；评审后的预览可追溯到实际设计系统，避免每个工具再创一套界面。交付是独立离线设计文档，不新增安装器、Host、SDK、AI Provider 或应用市场。

## 问题证据与选择

已核对的仓库事实：`workspace-ai-proposal.js` 发送任务、文件正文和身份；`workspace-chat-request.js` 回填被请求文件；工作流 planner 返回步骤 JSON。它们未自动附带 UI skill、R27 或设计 CSS。`sidebar-tool-development.zh-CN.md` 要求独立原型，但沙箱不继承宿主样式。用户当前失败 HTML 尚未提供，因此具体回答的偏离位置仍为 UNKNOWN。

选择 **确定性工具 + 可携带网页上下文 + 本地 skill**：只写 skill 不能让网页模型看到规范；复制一份手工 CSS 会漂移；修改工作流 JSON planner 会混淆职责。生成器直接读取唯一 CSS，网页提示词与 HTML 一起交付，回收后进行静态检查与交互评审。

## 现在可用

```sh
node scripts/sidebar-preview-kit.mjs create \
  --out artifacts/sidebar-preview-kit/my-tool-r1 --title "我的工具"
node scripts/sidebar-preview-kit.mjs check /absolute/path/returned-preview.html
```

`create` 输出三个文件：

| 文件 | 用途 |
| --- | --- |
| preview.html | 自包含设计稿，包含规范 CSS、可编辑内容/模拟 JS、六种状态和新建/编辑/取消/删除确认示例 |
| chatgpt-prompt.txt | 粘贴到网页的生成约束；仍需附上 HTML 实际内容 |
| manifest.json | 输入 SHA、HTML SHA 与证据等级；不是权限或信任凭据 |

在用户指定的既有 ChatGPT 对话中，由用户附上 `preview.html` 并发送提示词及工具需求；本工具不自动发消息、不读取凭据。模型须先列需求/视图/组件映射，再返回完整 HTML。若网页无法读取附件，明确缺失并改为用户粘贴完整文本；只给本地路径、模型自述“已遵守”、对话缩略预览均不能证明模型接收了规范。仓库 skill 为 `.agents/skills/opendesk-ui-preview/SKILL.md`。

只允许改 `#od-preview-app` 内部与 `#od-preview-behavior` 脚本文本；全部 CSS、外壳、模拟声明、CSP 和源身份保持原样。需要额外组件或布局时先在仓库评估真实缺口，扩展模板并重新生成，不在模型结果中临时覆盖颜色/圆角/按钮。预览可在普通浏览器独立打开；Workspace 的静态 HTML 净化预览会移除执行入口，不能据此判定本交互模板坏掉。

检查器验证当前源哈希、保护区、样式快照、重复 ID、按钮/输入语义、脚本语法及明显真实能力调用。任一失败 CLI 返回非零。过期模板保留原件，重生成后迁移内容并重验；不重写历史 manifest。未锁定任意 JS 的运行效果：静态 lint 和文档 CSP **不是不可信代码安全执行器**，通过检查也不能免除源码审阅与独立浏览器观察。

模板的可复现实测入口（复用已有 Playwright/CFT；不自动下载依赖）：

```sh
node scripts/tests/sidebar-preview-kit-browser.mjs <套件目录> <新的独立证据目录>
```

环境没有仓库级 Playwright 时，用 `OPENDESK_PLAYWRIGHT_MODULE` 指向现有 `playwright/index.mjs`；需要选择已有 CFT 时，用 `OPENDESK_PREVIEW_CHROME_BIN` 指定其可执行文件。观察器新建独立上下文、读取 canonical CSS 建立另一参考页，并在结束时关闭浏览器。原始报告绑定四项源、HTML、观察器 SHA、浏览器版本与平台。此脚本验证模板示例；改为实际工具流程后须同步该工具的用例，不能把模板按钮用例当作任意生成界面通过。

## 目标与关键验收条件

| 目标 | 关键条件 | R1 的证据范围 |
| --- | --- | --- |
| 样式来源唯一 | 内联 CSS 与 canonical 文件逐字一致；伪造/过期源、按钮覆盖、新 style 拒绝；保存四项输入 SHA | 定向 Node 合同 |
| 模型确实获得规范 | 实际网页对话收到 HTML 内容与提示词；返回同源完整文件；保留请求/回答、返回 HTML SHA、模型可见附件事实 | REAL_AI，未执行则 NOT_TESTED |
| 用户流程可走通 | 新建→空值错误→保存；编辑→取消不改数据；编辑保存；删除→取消与确认；空态可恢复；失败/撤权/忙禁止编辑；长文本可读 | 独立离线浏览器真实输入，不用 DOM 赋值或 synthetic events |
| 交互与无障碍 | 一个主标题、每视图一个主要操作；label/error/status 关联；键盘 Tab/Shift+Tab/Enter/Escape；表单与确认返回后焦点正确可见、长列表滚动位置恢复；禁用态真实 | DOM/可访问树 + 键盘与焦点观察 |
| 视觉一致 | 浅/深色与 hover/focus/disabled 状态；按钮、图标、输入、卡片、折叠与同源 CSS 参考的 computed style 相同；截图人工复核 | STATIC_PREVIEW_CHROME，仅证明设计稿 |
| 隔离与迁移 | 无网络/真实 Chrome/SDK/文件或持久数据；模拟不报原生成功；不得把宿主 CSS/脚本注入运行时动态 iframe | 静态负例 + 浏览器网络/控制台观察；实际 Host 另验 |
| 真实安装产品 | 按原项目打包、保留既有 opaque-origin iframe/可信静态模块边界；同候选权限、撤权、生命周期与核心操作通过 | NATIVE_CHROME / PACKAGE，不能用原型替代 |

正常窗口、默认缩放；多档缩放和 Side Panel 物理宽度矩阵为 OUT_OF_SCOPE。保留既有相关历史测试，不删除、不标成此次 PASS。未变更扩展源码，本轮不占用开发 watcher 或重建扩展。

## 评分与后续实施

独立专家按六项分别 0–100 评分：需求与网页可达性、单一样式/漂移、交互/可访问性、隔离边界、测试/证据、可维护性。**每项 ≥95、无阻断项**才通过方案关卡；低分指出可执行缺口，修订后复评。不把平均分、测试数量或模型自评分当完成百分比。专家方案评分与 REAL_AI/原生产品评分分开。

实施顺序：

1. 本轮 R1：生成/检查工具、模板、网页上下文、skill、定向回归、离线浏览器及独立专家审查。
2. 下一实际工具需求：用用户指定对话执行一次真实生成→回收→检查→修订，按上表保存证据；没有发送授权时不代用户发消息。
3. 产品入口接线：若真实使用证明必要，在 Workspace **显式设计预览**入口复用生成器合同，覆盖文件提案与读取回填两条路径；不塞进步骤 JSON planner。此项未实施。
4. 生产实现：按工具类型将已确认结构迁入既有源码；动态工具只在自身作用域映射 token/组件语义；可信 UI 由固定预编译入口接入。复用原打包、stage 和同候选真实 Chrome 验收。

当前状态、专家原文、原始日志和剩余项见 [R1 工作流](../framework/workstreams/sidebar-preview-kit-r1-20261015.md)。
