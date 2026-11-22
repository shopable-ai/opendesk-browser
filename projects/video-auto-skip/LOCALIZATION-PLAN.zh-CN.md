# 连播助手 · 多语言接入方案 R1（保留原生 HTML）

> 任务标识：OD-VIDEO-AUTO-SKIP-I18N-R1 ｜ 日期：2026-11-22  
> Owner：`projects/video-auto-skip/` ｜ 目标分支：`main`  
> 状态：**设计方案；未修改业务 i18n 源码、正式工具包或已安装 Chrome 实例。**

## 1. 现场基线与技术决策

- 当前产品属于 `opendesk.sidebar-tool.v2`，采用 `src/index.html`、`src/style.css`、`src/main.js`、`src/editor.js`、Vite 单 IIFE `dist/tool.js`。`src/page/main.js` 属于独立 USER_SCRIPT 网页模块。
- `tool.config.json` 未包含 `locales`；产品目录未有 `locales.json`；静态 HTML、动态 UI 与时间编辑器均有用户可见的硬编码中文。
- README 记录：开发源码为 0.2.10，唯一可导入正式工具包仍为 0.2.9；这两种状态不可混淆。`preview/index.html` 只是独立交互预览。
- 仓库已有 [Sidebar Tool 正式本地化合同](../../docs/api/sidebar-tool-localization.zh-CN.md)、[应用开发 Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md) 和原生 HTML/JS 实例 [Reading TOC](../reading-toc/locales.json)、[Reading TOC 源码](../reading-toc/src/main.js)。
- **架构结论**：HTML/JS 可直接多语言化。仅为多语言而切换 React 会引入不必要的组件迁移、构建与回归成本；未来若出现独立的复杂状态/组件重用需求，另行评估 React，不把两项工作捆绑。

## 2. 运行边界（不可混用）

| 运行环境 | 正确接入方式 | 禁止 |
| --- | --- | --- |
| GrayDove/OpenDesk 可信扩展页面（Host、Options、内部 React） | 复用 `src/i18n/`、可信 UI Locale Controller；确需浏览器扩展元数据本地化时按 Chrome 原生 `chrome.i18n` 处理 | 让用户工具翻译覆盖安装、授权或安全提示 |
| 连播助手 Sidebar Tool **沙箱 iframe** | 作者 `locales.json` + `tool.config.json` 的 `locales`；运行时只读 `OpenDeskTool.locale`、`OpenDeskTool.messages`、`OpenDeskTool.onLocaleChange()` | 直接调用 `chrome.i18n`、`chrome.storage`，或写宿主语言偏好 |
| 连播助手同包 USER_SCRIPT 网页模块 | 仅维护播放器识别、时间、跳过与切集逻辑；以后有浮层译文需要时另核对受信通路 | 通过 UI 翻译扩权、把沙箱 API 注入网页 |

Chrome 扩展原生 `_locales/*/messages.json` 和 OpenDesk 工具作者 `locales.json` 不是同一格式。**本任务不修改宿主 manifest、CSP 或权限。**

## 3. 用户体验和功能树

默认**跟随 OpenDesk 界面语言**。宿主合同已有 `auto / en / zh-CN / zh-TW / ja`；缺译文时回退中文源文案。单工具语言覆盖和导入语言包均复用宿主已有管理入口；连播助手侧栏内不新增重复语言下拉框。

| 优先级 | 功能 | 验收行为 |
| --- | --- | --- |
| P0 | 静态文案 | 标题、时间轴、保存/取消、说明、按钮、placeholder、title、ARIA 文案均随语言切换 |
| P0 | 动态文案 | 片头/片尾、继承、自动下一集、保存读回、草稿冲突、未知、错误、预览、撤销、定位和校验完整覆盖 |
| P0 | 动态切换与回退 | 切换语言只刷新展示，保留草稿、当前焦点、四个时间框、滑块、开启状态、当前播放器上下文；缺失键稳妥回退中文 |
| P0 | 数据与安全兼容 | 同一 toolId、存储 key、页面协议、规则版本、许可范围与跳过行为不变 |
| P1 | 日文/繁体完整翻译 | 先完成中英 P0 验收，再接入 `ja` 与 `zh-TW` 并检查窄侧栏宽度 |
| P1 | 导入和补译 | 复用现有 Host 的独立语言包校验，不自建在线翻译、会员或云端接口 |
| 非目标 | 作品名称、网页正文、字幕、浏览历史、用户备注、技术协议自动翻译 | UI 翻译不能更改网站内容或规则数据 |

**建议投放顺序**：`zh-CN`（源语言）→ `en`（首个目标语言）→ `ja`、`zh-TW`。不能以源语言中文本来可读作为英文状态覆盖通过的证据。

## 4. 源码接入步骤（待 Codex 实施）

1. 在产品目录新增**唯一作者语言文件** `locales.json`。顶层为 `sourceLocale` 和 `messages`；中文源值为字符串，目标值含 `{source,text}`，键用语义 camelCase（如 `saveSettings`、`introStart`、`outroEnd`、`storageConflict`）。禁止以整句中文作为键。
2. 在现有 `tool.config.json` 增加 `"locales": "locales.json"`，不更改 toolId、capabilities 或页面运行身份。继续由唯一 `scripts/build-sidebar-tool.mjs` 产生翻译 metadata 和离线内嵌资源，不创建第二个打包器。
3. 将现有 `__OPENDESK_TOOL_MESSAGES__` 单一标记放入 Vite 入口可达的轻量 `src/i18n.js`（或同等模块），保持打包后 `dist/tool.js` 中**恰好一个**令牌，供唯一正式 builder 替换。运行时优先读取 `OpenDeskTool.messages`，否则内嵌 catalog；源码中统一调用 `t(key, params)`。
4. 对 `src/index.html` 的静态字符串和属性建立固定键映射；动态字符串从 `src/main.js`、`src/editor.js` 收敛到相同 catalog。带参数的提示使用完整模板，例如 `{seconds}`、`{episode}`，不要用“中文前缀 + 数字 + 中文后缀”的硬拼接，因为其他语言词序可能不同。
5. 对 `onLocaleChange` 注册一个清理可控的监听：更新当前语言与合并后的只读 catalog，**只重绘用户可见文案**。不能借语言变化执行 `page.request`、重新识别、保存、清空、seek/next、重装 UI 或重建播放器连接；解绑/实例销毁时按原返回函数释放。
6. 所有译文只进入 `textContent` 和经校验的纯文本属性（placeholder、title、aria-label、aria-description 等）；不使用 `innerHTML`、远程翻译服务、CDN JS 或新增 CSP 权限。
7. 修改 `vite.config.mjs` 对源码指纹的枚举，将 `src/i18n.js` 和 `locales.json` 纳入 build-ready 防漂移闭包。`preview/index.html` 的翻译预览须与同一源 catalog 保持一致；不可手工维护第三套长期分叉译文。
8. 完成后才实施定向测试、单候选编译和同 ID 包版本晋升。实施前先合并/核对当前尚未晋升的 0.2.10 时间端点修改；**不以多语言任务覆盖片尾 End、四个清空 × 和已有草稿保护**。

**特殊保护**：`End` 是片尾结束的技术哨兵/可见默认值，`00:00` 是时间值；`intro/outro/next`、`rules.v1`、`kind:'tail'`、`seriesKey/episodeKey`、状态码与数据字段是程序契约。它们必须保持原样；仅解释性文案翻译。作品/单集继承、存储 CAS、定位防重复与切集确认不受翻译影响。

## 5. 数据预算与安全

依照唯一 [本地化合同](../../docs/api/sidebar-tool-localization.zh-CN.md)：作者语言 JSON ≤ 96,000 字节，最多 12 语言、每语言 ≤ 160 键、每条 ≤ 380 UTF-16 单元；正式工具包总大小仍须符合 320,000 UTF-8 字节上限。源文案变化时校验 `source`、`sourceCatalogHash`、参数占位符与实际译文；拒绝 HTML/事件属性、危险 URL、危险原型键、不可见控制/双向控制字符和过期翻译。宿主语言包导入若尚未有实际可用的 UI，须报告缺口，不能由 Tool 越权自行存储或覆盖全局偏好。

## 6. 可验证的验收矩阵

| ID | 核查 | 必须通过的结果 |
| --- | --- | --- |
| I18N-A01 | 静态和动态词条覆盖 | 重要源中文、错误态与按钮均有源键，英文版本无遗漏 |
| I18N-A02 | 占位符与语言回退 | 变量完整；缺失目标键回退中文而非空白、原始 key 或异常 |
| I18N-A03 | HTML/ARIA | `placeholder`、`title`、`aria-label`、`aria-describedby` 文案与实际 UI 一致 |
| I18N-A04 | 切语言保状态 | 未保存草稿、焦点、四个时间端点、滑块、开启状态、作品/集/线路均保持 |
| I18N-A05 | 业务副作用为零 | 切语言不会新增 page 请求、写存储、定位、切集或改变权限 |
| I18N-A06 | 数据安全负例 | HTML 注入、危险链接/字符、占位符漂移与超预算必须拒绝 |
| I18N-A07 | 小屏可用 | 320/360/400 px 与 200% 缩放下中文/英文/日语/繁中不遮挡操作控件 |
| I18N-A08 | 时间及规则兼容 | `End`、`00:00`、同集覆盖、跨集规则、用户播放回看和旧数据行为不变 |
| I18N-A09 | 构建与打包 | Vite 唯一令牌留存；正式 builder 替换；metadata、哈希、包大小通过 |
| I18N-A10 | 真正发布 | 同 ID 升级后原规则读回一致；真实 Chrome 侧栏与播放流程另有当前候选回执 |

**证据层级**：`DESIGN_ONLY` → `SOURCE_WIRED` → `NODE_PASS` → `PACKAGE_PASS` → `INSTALLED_CHROME_PASS`。Node 通过、静态预览或文档评分不等于真机安装或线上功能完成；没有当前候选原生证据则标记 `NOT_TESTED`。

## 7. 本轮边界

本次只建立设计规范与 Skill 指引；不修改 `src/`、`preview/`、`tool.config.json`、`dist/`、网页模块、正式 `video-auto-skip.opendesk-tool.json`、宿主 manifest 或安装权限。后续实施按 A01–A10 从现有源码增量接线，不额外迁移 UI 框架。
