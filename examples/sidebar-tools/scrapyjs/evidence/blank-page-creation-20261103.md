# 空白网页配置创建：核心开发证据

日期：2026-11-03，北京时间。工作目录 `/Users/shopme/Documents/workspace/opendesk-browser`，现有 `main`，基线 HEAD `24fa6344cea4cc21425967995f50f30cbc453d73`。保留并行 dirty，未提交/推送。

## 范围与当前状态

当前目标为 `https://books.toscrape.com/` 当前页书名、价格、详情链接，不翻页、不访问详情批量采集、不下载电子书文件。真实安装/AI 创建/采集/CSV/关闭重开复用：**待桌面租约释放后验证，NOT_TESTED**，不以 Node 或安装包通过替代。

完整提示词：

> 请根据当前网页创建一个采集配置：采集当前页每本书的书名、价格和详情链接，CSV 表头分别为书名、价格、详情链接，只采当前页。

必须新建独立配置并记录空白基线，不从旧配置复制规则。预计空白模型 `{ "url": "", "itemConfig": {} }`，真实基线尚未读取。生成的最终配置、记录/CSV逐行核对和重开复用结果在完成真实操作后补录。

## 已定位与修复的阻塞

- 原真实消费者为 `src/AiPanel.jsx` → 公共 Dock/Frame/session → prepareAI → 受控 AI bridge → 原 business.config.propose/apply。先前只发 title/URL，sample 为空，且窄意图语法将原话判为 needs-input。单项诊断已复现；没有手填最终配置冒充 AI。
- 固定 Controller 新增只读 context 样本，最多 12000 字符、过滤表单/编辑区/脚本等；`ai-page.js` 复用原 controllers.start/read/stop，5500ms 有界准备，原请求不重放。应用前重读原观察身份；同 URL 的不同文档不作为同一文档。
- 从空规则明确创建单页列表时才启用此链；精确表头编辑继续原差异校验。提案仍是数据，不授予权限，不自动保存/采集/导出。
- 仅为本轮真实操作在固定 Controller 审阅范围增加 Books to Scrape 的精确 origin；没有域名业务分支或专用选择器。独立旧 HTTP Task 包及 pin 保留。

## 当前验证与产物

- 创建范围测试先失败（needs-input 代替 create），修复后通过；真实 React 夹具先失败（sample 为空），修复后通过正常应用及同 URL 换文档拒绝。
- AI actions/panel/request/pending：90/90 PASS；AI App/page/inspection/session：63/63 PASS；包、原页面适配、CSV：13 项通过（包测试独立复跑通过，修正了 origin 数组顺序断言，不改权限语义）。仅表示各自组件控制逻辑。
- `npm run build --prefix examples/sidebar-tools/scrapyjs` 编译成功；原 `build-sidebar-tool.mjs --out` → 定向门禁 → `--promote-from` → `--check-project` 成功。
- 唯一正式包 1.9.0，SHA-256 `62f51de1819af73d0a8834810e83c0a8168a7662c21d648d21cbcbc9d4623ff2`，1352966 bytes。这是包检查结果，尚不证明本轮已安装或运行。
- Browser 仍使用原 `dist/development`。原开发服务由 Toast 测试 owner 恢复，实读 PID 10656 监听 43119/43120；尚未由本对话核对运行指纹/连接。未停止或复制其服务。
- 原生桌面租约仍属 `01a1a001-0b30-7562-b5a5-34d2a1b6c71f`，本对话未抢占、清锁或另开副本。

豆瓣已有配置的表头、原保存及回读证据复用 [1.8.20 直接发送记录](csv-title-direct-send-20261103.md)，它不证明本轮空白创建。production、评分、完整矩阵、复杂网站及长期服务稳定性均 NOT_TESTED。
