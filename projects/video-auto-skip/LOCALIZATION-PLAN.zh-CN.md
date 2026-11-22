# 连播助手 · 多语言接入方案 R1 与本地验收 R2

> 任务标识：OD-VIDEO-AUTO-SKIP-I18N-R1 ｜ 日期：2026-11-22  
> Owner：`projects/video-auto-skip/` ｜ 目标分支：`main`  
> R1 状态：**SOURCE_WIRED + NODE_PASS + CANDIDATE_PASS**（同提交 GitHub App CI 已成功）。本机 Chrome、升级和当前正式包状态以第 9 节 R2 回执为准。

## 1. 现场基线与技术决策

- 当前产品属于 `opendesk.sidebar-tool.v2`，采用 `src/index.html`、`src/style.css`、`src/main.js`、`src/editor.js`、Vite 单 IIFE `dist/tool.js`。`src/page/main.js` 属于独立 USER_SCRIPT 网页模块。
- 实施前基线：`tool.config.json` 尚无 `locales`、项目无 `locales.json`，静态/动态界面存在硬编码中文。R1 已按本合同新增作者语言资源与源码接线；`src/page/main.js` 的网页提示仍是独立运行边界。
- R1 实施时，开发源码为 0.2.10，正式可导入包为 0.2.9。`preview/index.html` 只是独立交互预览。
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

## 4. 源码接入步骤与核对项

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

本次实施范围仅包含工具的 `locales.json`、侧栏 HTML/JS、Vite 指纹、定向测试及进度文档；`dist/`、正式 `video-auto-skip.opendesk-tool.json`、`src/page/main.js`、预览大文件、宿主 manifest、授权和播放器业务协议均未改动。GitHub CI 已构建但未晋升同源候选，**未通过真实 Chrome 安装/升级和布局验收前不宣称发布**。

## 8. R1 源码接线与当时的验收状态（2026-11-22）

- 已新增作者语言表 `locales.json`，统一 159 个语义键，`zh-CN/en/ja/zh-TW` 四个语言均完整；复用 Host 的只读 `OpenDeskTool.locale/messages/onLocaleChange`，无 React 迁移、无新语言选择器。
- `src/i18n.js` 使用唯一 `__OPENDESK_TOOL_MESSAGES__` 编译标记；`src/main.js`、`src/editor.js`、`src/time-track.js` 和 `src/index.html` 通过同一 `t(key, params)` 与 DOM 纯文本属性刷新，保留草稿、端点及 End 哨兵。
- `tool.config.json` 增加 `locales`；`vite.config.mjs` 将语言源与 helper 纳入原有 build-ready 指纹。增加 `tests/i18n.test.mjs` 并调整 `tests/sidebar-status.test.mjs` 的测试宿主源语言 catalog。
- 本轮只读在 GitHub 已确认 `src/page/main.js` 中仍有「连播助手：已跳过片头/片尾」网页 toast。该 USER_SCRIPT 尚无获证实的受控语言流，因此未向网页暴露 Sandbox Tool API，也未修改页面模块；此项明确属于**独立未完成**。
- 静态源检查：四语言键和占位符闭包 159/159；调用仓库现有 `compileToolLocaleCatalog()` 校验成功；对侧栏主模块、编辑器、滑块及 helper 的 V8 语法解析成功。**同一提交随后经 GitHub App CI 完成 Vite 编译与现有 Builder 产生同源未晋升候选；组合 Node 测试 104/104 PASS（含四语言资源、回退、转义安全、动态切换与 End/草稿断言）。** [工作流与原始日志](https://github.com/shopable-ai/opendesk-browser/actions/runs/45035680976)，源码提交 `0810fd059caeddace0fff78d9aca1e2df030a3f8`。
- **CI 已完成**：项目编译、原 Builder 同源候选和组合 Node 回归。CI 候选 `0.2.10` 的 SHA-256 为 `0222a480ef1674fd4b4a104e9707ac64e61f4834dd32cb5da51ef1421dbbeee7`，状态 `CANDIDATE_SOURCE_IDENTICAL`。**仍未完成**：本机独立复跑、320/360/400px 与 200% 缩放、真实安装后的四语言切换/保存/跨集/重开、原生 Chrome 同 ID 升级与前后规则读回。CI 的 Chromium UI 和网页操作步骤被测试配置跳过，不能标记为通过。
- 现有 `0.2.9` 正式包未被替换，`0.2.10` 源码仍未晋升；**尽管 Builder/Node 门禁已通过，仍须真实侧栏/播放与跨语言人工验收后，才能决定是否按既有发行 Skill 晋升**。不要把 CI 候选或源码提交解释为本机安装成功。
- 本地 Mac 的未提交工作区未核验：当前本机 CodexPro 与文件隧道不可用，远端 GitHub `main` 的可读/可写状态不能代替本地 `git status`。本地同步时必须先确认/保护 0.2.10 未提交修改。

## 9. R2 本地验收与正式包（2026-11-22）

复用第 8 节的 R1 CI 证据。本轮在本地 `main` 对齐 `59463f1fb` 并保留 R13 已验证剧集的继承、iYF 历史默认保护和独立作品标题索引。历史 0.2.10 已在独立 Chrome 首装并绑定播放器；它与 0.2.9 的网页模块 Revision 同为 9 且内容不同，源码预检不允许这样升级（该拒绝未在 Chrome 实测）。本次晋升路径为 **0.2.16 → 0.2.17**，工具 ID `video-auto-skip`，网页模块 Revision 17。保留 HTML/JavaScript/Vite、原执行身份、权限和 `rules.v1`。

差量修复：补齐规则开关、片尾状态、诊断文案及相关无障碍名称，四语各 160 键；可用宽度不超过 280 CSS px 时，时间端点排列为单列，标题及时间轴文本可换行。修复前的候选在 Chrome 200% 缩放下英语侧栏有横向溢出；同一专项在最终候选通过。没有改播放器执行算法。

以下回执位于本机 `artifacts/sidebar-tools/video-auto-skip/i18n-r2-approval-0810fd059/`，原生回执使用 Chrome for Testing 155.0.8059.39、固定静态 `dist/production`、独立临时 Profile、真实 Chrome Side Panel 和本机多集视频夹具。宽度通过 CDP 设置侧栏视口；语言切换走真实 Host 的设置事件；200% 使用 Chrome tab zoom。

| 项目 | 结果与证据 |
| --- | --- |
| R2 Node、资源与请求 | **PASS**：`r2-final-targeted.tap` 39/39。四语键、占位符、回退、纯文本插入、草稿与焦点；组件捕获的语言切换附加业务请求为零，冲突与结果未知由定向 Node 覆盖。 |
| Chrome 首装、识别与四语 | **PASS**：`candidate-r2-native-i18n.json`。受控审阅、安装、刷新绑定、四语保草稿／焦点／暂停，320/360/400 CSS px 共 12 个组合无横溢，四个清除按钮、`00:00` 和 `End`、保存关开读回，210→240 秒按尾距换算 03:20→03:50。 |
| 无障碍文案、缩放、播放 | **PASS**：`candidate-r2-native-extra.json`。四语错误、Tooltip 和控件名称；真实 200% 下四语无横溢，实点输入、清除、保存；固定片头及片尾各跳一次，切语言期间自然结束只进一次下一集且播放继续。 |
| 0.2.9 同 ID 升级与旧规则 | **PASS**：`native-r2-upgrade-029-final.json`。审阅回执确认 0.2.17；待 Revision 17 注册后刷新重新绑定，`rules.v1` 不变，读回 00:00、00:18、03:20、End，尾距 10 秒，仍为已保存状态；新作品索引使用独立键。 |
| 旧本集例外与作品继承 | **PASS**：`native-r2-upgrade-026-final.json`。先在支持范围切换的旧版用 UI 保存作品默认 00:18 和第 1 集例外 00:22；同 ID 升级后，第 1 集仍为 00:22，第 2 集继承 00:18。 |
| 正式文件升级与规则读回 | **PASS**：`native-r2-upgrade-0216-formal.json`。从前一正式包 0.2.16 审阅更新到项目的正式 0.2.17 JSON，持久化规则不变，刷新后端点及已保存状态读回一致。 |
| Vite、候选与正式包 | **PASS**：Vite build-ready ID `48fd93ab-3d4a-4a04-8233-8ad8b11ef5df`；原 Builder 晋升及 `--check-project` 通过，正式 JSON 与验收候选逐字节相同（206417 字节，SHA-256 `3824878a2744a9db2d60a3fd2f22dad8a3c287fd15c47c2edd917ab28eb0b543`）。 |
| 外部环境 | **NOT_TESTED**：日常 Profile 安装、iYF 实站、Chrome 原生保存冲突及写入未知故障注入、屏幕阅读器朗读。此处回执不覆盖这些场景。 |

网页 USER_SCRIPT 的播放提示仍是中文，本轮未改。公开 [Page Module API](../../docs/api/sidebar-tool-page-module.zh-CN.md#应用网页-api) 提供 `OpenDeskAppPage.readContext()`，可受控读取当前语言和目录，但未公开网页侧实时语言订阅。本地化网页提示可在原授权下另做，不从网页调用 Sidebar Tool API。
