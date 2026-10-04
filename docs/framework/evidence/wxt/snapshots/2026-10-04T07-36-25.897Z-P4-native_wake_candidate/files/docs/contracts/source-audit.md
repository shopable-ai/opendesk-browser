# OpenDesk Browser 阶段01固定来源审计

本报告仅读取固定三来源快照与source-ledger.json，输出合同设计证据及待审查项。没有生产实现，未读取原始三仓库，未外网取证，未将旧草稿作为结论。**仅作静态审计与字节验证；未启动浏览器或执行来源测试，不能声称功能运行验收通过，不能宣称可收费上线。**

## 人工审查先看这五点

1. SDK receipt与安装bundle匹配，和固定core输入不匹配：27个输入22个相同、5个分叉。当前扩展现状以安装bundle为准，旧TS及当前core均不能直接替代。
2. 手改JSON后的preview只是旧数据投影，没有重新执行选择器；采集完成还会反推并覆盖config。
3. SDK有stop，窗口/消息表没有STOP闭环；120秒等待超时不是后台停止。
4. 无限滚动、已确认文件保存、AI自动配置未有当前接通证据；不要由标签或文件存在推导支持。
5. todo有MIT全文，core仅ISC声明，扩展本体及第三方/手改衍生许可链不完整。

## 固定快照验证

捕获时间：`2026-10-01T18:29:13.482003+00:00`；审计时间：`2026-10-01T18:51:32.819530+00:00`。
ledger SHA-256：`6188ff9cadd06b44a19d08982a3dadc5596cd6303140c8eba0fdd25996e89f29`。

| 快照 | HEAD（上下文） | 文件 | 验证 | scope |
| --- | --- | ---: | --- | --- |
| scrapyJsChrome | `9d55e4b615db3ef044094f3e8c3f1015a795dd83` | 265 | hash/bytes均匹配，无缺失/额外文件 | `.` |
| scrapyJs | `5bebc68832fe1bd6b4466de53a824dfae5fdaf5e` | 105 | hash/bytes均匹配，无缺失/额外文件 | `src, test, scripts, project, package.json, package-lock.json, README.md, webpack.config.js, gulpfile.js, vitest.config.js` |
| todo-src-bex | `3f8a10613df4d87cb7a76f6bb71fcac5fcd17d20` | 72 | hash/bytes均匹配，无缺失/额外文件 | `src-bex, LICENSE, package.json, AGENTS.md` |

合计**442/442**匹配。行号为1起始物理行，哈希基于原字节。core快照为显式scope；scope外文件无法核定。扩展/core捕获包含dirty/untracked，todo为clean；不能用HEAD代替源字节。依据：[source-ledger.json L3–14](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-ledger.json:3)；[source-ledger.json L1360–1375](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-ledger.json:1360)；[source-ledger.json L1922–1932](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-ledger.json:1922)。

## SDK哈希、分叉与手改来源链

| 检验 | 值 | 结论 |
| --- | --- | --- |
| installed SDK / receipt.sdkHash | `a04ca62faf0ae1e9457a3499f40acb107a2452ceafd4d8fe6f59ba8617fa1d52` | 相同 |
| receipt输入map重算sourceHash | `05d457c044fa6aa86e7da18628a62bcbc3946426a90fbff80d9474b1c239423a` | 与记录相同 |
| 当前core同名输入重算sourceHash | `3bacf5875d527c5e1ba4ef8bfb43f307d1dd3d80db0917be4ba11ef89fed9127` | 与记录不同 |
| receipt文件SHA-256 | `65627307a024644c291e143d38a67ae8f74c2d63a5be3e90570a173f90686b01` | 与transaction.after[1]相同 |
| builtAt / version / protocol | `2026-10-01T18:22:28.460Z` / `1.0.0` / `1.0` | 元数据，不构成上线许可 |

采用sdk-sync规则：对排序walk得到的inputs map执行JSON.stringify(map,null,2)+换行，再SHA-256。receipt自身map也以同规则重算。sourceHash不是SDK文件hash，也不是Git HEAD。extension-check核验receipt自洽和安装SDK字节，不比对当前core文件；本次额外逐项比对固定core。

| 失配输入 | receipt哈希 | 当前快照哈希 |
| --- | --- | --- |
| src/core/ChromeSpider.js | `13c3558db1387fcbc1d40782af92003aec38b237e58ccae336c7844aa67ded7d` | `bc5b540c7ec4eb44699506b74ff0f0a247cf7e75121f9ebcbdf8361b0856e615` |
| src/core/ListSpider.js | `30f6c417148ff3afebeae04387da5ce34c3362e19bfa22edd95991453fd87ca9` | `5654be5848b67dcd48792b98336a83293e204176df26a3b1eadfccd89f0694ef` |
| src/core/Pipeline.js | `904cf044f4fd4199b963c526699d15de4ce718950c2bd3faeecac88572c795d9` | `5aafd36a128291bbad74db69d45647c542ff0453fd2cef63b50d4c705f7fe236` |
| src/exporter/ExportManager.js | `faad58975b9ea694b7d590243148fc8ee95f01221dc8dd55644785b9ff9735bf` | `65cc467d1832aa892be6af9bb719714cfaf4f61115bb885f9cbd58c511c453e8` |
| webpack.config.js | `3ca3625e481c84641deaa03ee270770142753c0969594a7db24510c7f9493b3f` | `9727710f5c45535cc609076bba3c69973b8e88c8750947a1bbdf43c0ccef4eab` |

[scrapyJsChrome/assets/js/plugins/scrapyJs.source.json L1–43](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.source.json:1)；[scrapyJs/scripts/sdk-sync.cjs L58–82](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJs/scripts/sdk-sync.cjs:58)；[scrapyJsChrome/scripts/extension-check.cjs L118–136](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/scripts/extension-check.cjs:118)；[scrapyJsChrome/.sdk-backups/1790878948812-e882a430-37b0-475e-9ca5-4f8768e44fa9/transaction.json L1–15](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/.sdk-backups/1790878948812-e882a430-37b0-475e-9ca5-4f8768e44fa9/transaction.json:1)。

备份before-0与transaction.before[0]匹配：`3a6cc687e15bcf21fc007c509788e0f453d867c04224b04f7a0ed8ceffa501cb`；after的SDK/receipt分别匹配本次字节。旧备份不能作当前SDK。transaction未签名，只证明记录内部和字节一致，不能证明操作者、完整修改历史或权属。

- **CHAIN-EXT**（active-installed）：manifest->MV3 worker->ChromePage/SDK/background.js->SCRAPYJS_RUN->已安装SDK。 [scrapyJsChrome/manifest.json L11–12](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/manifest.json:11)；[scrapyJsChrome/background-sw.js L3–21](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js:3)；[scrapyJsChrome/background.js L15754–15780](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15754)；[scrapyJsChrome/background.js L16079–16141](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16079)。
- **CHAIN-TS**（historical-reference）：旧todo background.ts使用eval；编译background.js有新增RUN及ID响应链，不能直接互换。 [todo-src-bex/src-bex/background.ts L33–65](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/todo-src-bex/src-bex/background.ts:33)；[todo-src-bex/src-bex/background.ts L403–418](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/todo-src-bex/src-bex/background.ts:403)；[scrapyJsChrome/background.js L15616–15623](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15616)；[scrapyJsChrome/background.js L15754–15809](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15754)。
- **CHAIN-SDK-MANUAL**（dirty-snapshot-and-transaction）：ledger记录SDK modified/receipt untracked；transaction.before记录旧SDK hash，after对应本次bundle和receipt。记录未签名，不证明操作者身份、完整历史或权属。 [source-ledger.json L7–14](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-ledger.json:7)；[scrapyJsChrome/.sdk-backups/1790878948812-e882a430-37b0-475e-9ca5-4f8768e44fa9/transaction.json L1–15](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/.sdk-backups/1790878948812-e882a430-37b0-475e-9ca5-4f8768e44fa9/transaction.json:1)；[scrapyJsChrome/assets/js/plugins/scrapyJs.source.json L1–43](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.source.json:1)；[scrapyJs/scripts/sdk-sync.cjs L190–221](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJs/scripts/sdk-sync.cjs:190)。
- **CHAIN-HAND-CONFIG**（reachable-static）：手改JSON->内存/本地单key->结构化RUN->SDK提取->结果反推并覆盖config。input预览仅投影旧数据；codeArea手改不进入Start执行链。 [scrapyJsChrome/www/popup_crawl.js L1682–1707](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1682)；[scrapyJsChrome/www/popup_crawl.js L1327–1358](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1327)；[scrapyJsChrome/www/popup_crawl.js L1737–1740](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1737)；[scrapyJsChrome/background.js L16091–16115](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16091)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L2504–2586](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:2504)；[scrapyJsChrome/www/popup_crawl.js L1780–1795](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1780)。

后续若要同步，需先保留当前bundle/receipt并评估五个输入变更；本阶段不重建、不同步、不覆盖原bundle。

## 逐项行为及合同影响

“保留”指来源语义值得保留，仍需后续运行验收；“改造”指出现状具体缺口；“不支持”指未接通或证据不足。SDK-only不能写成popup已有产品能力。合同影响为阶段01建议和人工待决项，不代表架构已批准。

### SRC-01 实际加载入口与历史TS（保留）

**当前证据：**manifest指定background-sw.js；worker加载ChromePage.js、scrapyJs.js、background.js。爬虫窗口是popup_crawl.html，加载popup_crawl.js与tb-bridge.js；background.js中的src-bex/background.ts仅是编译来源标记。

**合同影响：**按实际加载文件审计现状。todo TS仅为历史参考；不能用旧TS覆盖编译bundle。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/manifest.json L11–17](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/manifest.json:11)；[scrapyJsChrome/background-sw.js L3–21](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js:3)；[scrapyJsChrome/background-sw.js L75–84](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js:75)；[scrapyJsChrome/background.js L15616–15623](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15616)；[scrapyJsChrome/background.js L17221–17234](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:17221)；[scrapyJsChrome/www/popup_crawl.html L7–8](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.html:7)。

### SRC-02 安装SDK与固定core分叉（改造）

**当前证据：**receipt与已安装SDK bundle匹配且内部sourceHash自洽；与固定scrapyJs快照不匹配，五个输入已分叉。相同HEAD不能证明dirty/untracked输入一致。扩展现状以安装bundle为准，禁止用旧TS或当前core源码直接替代现状证据。

**合同影响：**合同并列installedSdkHash与capturedCoreSourceHash；失配源码只作为后续参考。阶段01不重建、不同步。

**证据状态：**`provenance-verified`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapyJs.source.json L1–43](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.source.json:1)；[scrapyJs/scripts/sdk-sync.cjs L58–82](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJs/scripts/sdk-sync.cjs:58)；[scrapyJsChrome/scripts/extension-check.cjs L118–136](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/scripts/extension-check.cjs:118)；[scrapyJsChrome/.sdk-backups/1790878948812-e882a430-37b0-475e-9ca5-4f8768e44fa9/transaction.json L1–15](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/.sdk-backups/1790878948812-e882a430-37b0-475e-9ca5-4f8768e44fa9/transaction.json:1)。

### SEL-01 点击选中整个列表容器（保留）

**当前证据：**startTableSelection取消上一轮同类选择；悬停、点击沿祖先寻找列表，受minChildren、尺寸和相似度启发式限制。成功后lists只含手选列表、currentIndex=0，抽取并发送数据。

**合同影响：**保留用户确认列表容器；可视化说明记录范围，点击单个节点不等于选择单个字段。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js L378–408](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js:378)；[scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js L433–496](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js:433)；[scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js L499–565](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js:499)。

### SEL-02 有效选区和另一个表格（改造）

**当前证据：**getTableData优先当前索引，其次手选列表；next优先isManualSelection，再自定义或循环候选。有手选列表时另一个表格可能仍是同一个手选项；无选区返回null。

**合同影响：**分开currentSelection、候选和清除手选动作；新选区无数据不得沿用旧预览。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapy/listSelectorCore.js L149–208](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/listSelectorCore.js:149)；[scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js L21–82](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js:21)；[scrapyJsChrome/www/popup_crawl.js L1643–1668](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1643)。

### SEL-03 取消选区未形成消息闭环（改造）

**当前证据：**UI有cancelTableSelection/cancelNextButtonSelection清理函数；后台selectorAction没有cancel分支，所审计选择UI未找到Escape分支。

**合同影响：**明确cancelSelection及监听/高亮清理结果，与stopRun分离。

**证据状态：**`local-method-only`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js L210–234](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js:210)；[scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js L554–565](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js:554)；[scrapyJsChrome/background.js L16212–16233](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16212)。

### SEL-04 模块注入存在静态缺口（改造）

**当前证据：**内容脚本在bilivip/isClient条件下以module script注入ListSelector；后台fallback却用executeScript(files)加载含import/export的ListSelector.js；scrapyJsHelper.js全部非空行是//注释。

**合同影响：**把module/classic加载一致性作为后续验收前置条件；日志NO CSP ERRORS不等于浏览器实测成功。

**证据状态：**`static-integration-gap`；静态判断置信度high，未做浏览器运行验证。 仅为静态加载形式不一致，未报告浏览器实测异常。

**准确文件行号：**[scrapyJsChrome/my-content-script.js L839–862](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/my-content-script.js:839)；[scrapyJsChrome/assets/env.json L12–15](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/env.json:12)；[scrapyJsChrome/assets/js/plugins/scrapy/ListSelector.js L1–30](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/ListSelector.js:1)；[scrapyJsChrome/background.js L16627–16659](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16627)；[scrapyJsChrome/assets/js/plugins/scrapyJsHelper.js L1–5](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJsHelper.js:1)。

### SEL-05 活动tab和默认主frame（改造）

**当前证据：**manifest all_frames=true；选择动作与ChromePage.evaluate实际只指定tabId，未带frameId。调用重查活动非扩展tab，page/selector为全局单例。

**合同影响：**合同绑定tabId/frameId/document或snapshot身份；导航/切tab使旧选区失效。all_frames不能证明任意iframe采集已支持。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/manifest.json L18–24](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/manifest.json:18)；[scrapyJsChrome/background.js L16181–16191](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16181)；[scrapyJsChrome/assets/js/plugins/ChromePage.js L1157–1166](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/ChromePage.js:1157)；[scrapyJsChrome/assets/js/plugins/ChromePage.js L1173–1206](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/ChromePage.js:1173)；[scrapyJsChrome/assets/js/plugins/ChromePage.js L1269–1288](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/ChromePage.js:1269)。

### FLD-01 列表容器与字段提取ABI（保留）

**当前证据：**SDK ItemLoader用_listContainer首个CSS命中容器并遍历直接children；无容器从document提取详情。字段支持字符串selector::attribute、嵌套对象；CSS查后代，//前缀走XPath；零/单/多命中分别为空串/标量/数组。

**合同影响：**保留CSS及显式属性和_listContainer兼容映射；标注rowMode=directChildren、命中数、记录自身与后代差异。XPath现状存在不代表新合同应自动支持。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapyJs.js L2504–2563](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:2504)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L2566–2586](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:2566)。

### FLD-02 自动字段依赖首行及选择器字符串（改造）

**当前证据：**processDataAndConfig只从第一行建立配置；移除key开头点号、忽略_和[href=；text+href拆成文本/-url，复杂对象截断到100字符。选择器key不是明确业务字段命名。

**合同影响：**定义key/label/selector/attribute/type/required/order；保留原值和来源，首行不能证明字段覆盖。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L865–940](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:865)；[scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js L423–476](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js:423)。

### FLD-03 跨行链接图片去重及表头假设（改造）

**当前证据：**一次getTableData共用processedHrefs/processedSrcs，多个记录同href/src后续可能丢该属性；table分支把第一行当header并跳过。

**合同影响：**不能因共享链接/图片静默删除不同记录的数据；验收同URL两条记录及无表头table。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js L62–67](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js:62)；[scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js L120–139](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js:120)；[scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js L287–315](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js:287)；[scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js L336–365](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js:336)；[scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js L373–414](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/tableDataExtractor.js:373)。

### FLD-04 默认title过滤未适配通用字段（改造）

**当前证据：**popup提交pipelines:[]；后台默认pipeline丢弃!item.title记录。自动生成配置并不保证key名为title。

**合同影响：**按明确required/schema处理，回传过滤原因/数量，不能把title默认成所有任务必需字段。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L1737–1740](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1737)；[scrapyJsChrome/www/popup_crawl.js L882–912](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:882)；[scrapyJsChrome/background.js L16095–16109](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16095)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1437–1455](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1437)。

### PRE-01 手改JSON预览没有重新提取（改造）

**当前证据：**input仅对originalRawData简化后按newConfig key重排/补空，没有执行新selector或容器。改选择器、改容器、增加新key无法读取新DOM。

**合同影响：**preview需带configRevision/pageSnapshot，使用同一提取契约执行；旧数据标stale，返回字段命中/空值。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L943–975](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:943)；[scrapyJsChrome/www/popup_crawl.js L1682–1707](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1682)。

### PRE-02 显示列与导出数据不同（改造）

**当前证据：**setTableData按configOrder显示列，却将全量formatTableData存currentData；后者按全部行字段并集补齐。导出直接读currentData，可能包含未显示字段，顺序也未保证与UI一致。

**合同影响：**显示、复制、导出共享显式字段投影和顺序及同一configRevision。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L414–444](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:414)；[scrapyJsChrome/www/popup_crawl.js L504–559](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:504)；[scrapyJsChrome/www/popup_crawl.js L569–570](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:569)；[scrapyJsChrome/www/popup_crawl.js L1838–1864](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1838)。

### PRE-03 UI运行统计没有完整SDK终态（改造）

**当前证据：**popup仅idle/running/success/error，DOM行数用于显示统计；后台只返回data及pageCount/itemCount，没有SDK的runResult、delivery、filtered/discarded/partial。空结果在UI标error。

**合同影响：**区分preview/run结果；定义empty/failed/partial/stopping/stopped与导出ack，不能把UI行数当完整进度。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L1011–1023](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1011)；[scrapyJsChrome/www/popup_crawl.js L1070–1108](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1070)；[scrapyJsChrome/www/popup_crawl.js L1766–1774](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1766)；[scrapyJsChrome/background.js L16112–16141](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16112)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1334–1357](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1334)。

### CFG-01 本地保存恢复已有链路（保留）

**当前证据：**有数据的选区事件和合法JSON input写chrome.storage.local.scraperConfig；初始化读同key。customHeaders/language独立存储。

**合同影响：**保留本地配置及显示名持久化，合同说明写入确认/读取失败。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L1474–1498](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1474)；[scrapyJsChrome/www/popup_crawl.js L1682–1707](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1682)；[scrapyJsChrome/www/popup_crawl.js L688–713](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:688)；[scrapyJsChrome/www/popup_crawl.js L1894–1901](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1894)。

### CFG-02 配置不是版本化完整档案（改造）

**当前证据：**scraperConfig为全局单key，无版本/revision/页面绑定；仅JSON parse校验，写入未等待ack。nextPageSelector、delay、无限开关不随该key保存。另一个表格及完成采集重建内存config而非总同步存储。

**合同影响：**完整envelope及来源/迁移/错误合同；明确何时覆盖与保存；结果不能无确认替换用户选择器映射。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L181–186](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:181)；[scrapyJsChrome/www/popup_crawl.js L1327–1358](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1327)；[scrapyJsChrome/www/popup_crawl.js L1643–1668](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1643)；[scrapyJsChrome/www/popup_crawl.js L1682–1707](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1682)；[scrapyJsChrome/www/popup_crawl.js L1780–1795](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1780)；[scrapyJsChrome/www/popup_crawl.js L1894–1901](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1894)。

### CFG-03 手改容器可能被旧listSelector覆盖（改造）

**当前证据：**JSON input更新config，却不更新独立全局listSelector。buildSpiderConfig优先listSelector覆盖itemConfig._listContainer；例如先选A，再把JSON容器改成B，Start仍可能提交A。

**合同影响：**容器采用唯一配置真源；手改容器使旧选区/预览失效，提交时展示实际容器与revision；不能默默覆盖用户输入。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L181–186](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:181)；[scrapyJsChrome/www/popup_crawl.js L1470–1485](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1470)；[scrapyJsChrome/www/popup_crawl.js L1682–1704](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1682)；[scrapyJsChrome/www/popup_crawl.js L1327–1333](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1327)。

### CFG-04 运行结果反推配置会丢原selector映射（改造）

**当前证据：**采集数组完成后再调processDataAndConfig(crawledData,listSelector)，并以configObj替换config。对已是业务字段的结果，如title:"产品A"，会生成title:"title"，从而丢原title:".title"选择器；后续再运行可能查询错误元素。此覆盖分支未同步保存scraperConfig，内存/恢复配置还会分叉。

**合同影响：**结果只更新结果集，不反推替换已确认提取配置；如果要生成新配置，另建proposal/revision供明确审查。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L882–894](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:882)；[scrapyJsChrome/www/popup_crawl.js L1780–1795](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1780)。

### MSG-01 ID响应和等待超时（保留）

**当前证据：**popup生成requestId/meta协议1.0，检查存在的响应ID；execute等30秒，RUN等120秒。后台success/requestId/errorCode/data封装并return true支持异步。

**合同影响：**保留相关性与可诊断错误；超时仅结束调用方等待，不代表后台已停止。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L82–172](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:82)；[scrapyJsChrome/www/popup_crawl.js L805–861](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:805)；[scrapyJsChrome/background.js L15628–15648](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15628)；[scrapyJsChrome/background.js L15679–15700](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15679)；[scrapyJsChrome/background.js L15789–15809](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15789)。

### MSG-02 版本、sender和页面授权未闭合（改造）

**当前证据：**后台兼容detail/data/hid_，缺ID自动生成，所审计dispatcher未强制验protocolVersion/sender业务授权；getRequestId不一致异常在异步try之前。页面CustomEvent可构造消息；BEX window message仅检查source===window和from。

**合同影响：**限定版本、必需ID、消息枚举、sender/document身份和payload边界；错误走可响应通道。requestId不是许可凭据。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/background.js L15631–15648](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15631)；[scrapyJsChrome/background.js L15713–15809](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15713)；[scrapyJsChrome/assets/js/core/custom_event.js L10–53](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/core/custom_event.js:10)；[scrapyJsChrome/my-content-script.js L613–627](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/my-content-script.js:613)。

### MSG-03 选区事件没有业务快照绑定（改造）

**当前证据：**ListSelector发送ScrapyJs.selected_tableData/selected_nextPageBtn至CHROME_BRIDGE_POPUP；CustomEvent包装新ID；后台拆BridgeEventName送TB.bridge；popup处理res.data，未检查selectionId/runId/configRevision/document。

**合同影响：**保留兼容适配层，结果必须绑定选区/配置/页面身份，迟到结果不能覆盖新任务。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapy/listSelectorCore.js L253–282](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/listSelectorCore.js:253)；[scrapyJsChrome/assets/js/core/custom_event.js L21–45](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/core/custom_event.js:21)；[scrapyJsChrome/background.js L15738–15752](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15738)；[scrapyJsChrome/assets/js/core/tb-bridge.js L170–215](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/core/tb-bridge.js:170)；[scrapyJsChrome/www/popup_crawl.js L1438–1489](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1438)。

### MSG-04 手改代码不属于Start执行来源（保留）

**当前证据：**Start通过SCRAPYJS_RUN传spiderConfig，不读取codeArea编辑；后台忽略字符串pipeline。CHROME_PAGE_EXECUTE先选择结构化action，仍保留script/code分支；旧TS直接eval。

**合同影响：**保留声明式运行入口；文案区分可执行手改JSON与生成代码展示。不得采用旧eval或把代码框编辑视为生效。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L1327–1358](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1327)；[scrapyJsChrome/www/popup_crawl.js L1710–1740](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1710)；[scrapyJsChrome/background.js L16095–16109](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16095)；[scrapyJsChrome/background.js L16144–16168](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16144)；[todo-src-bex/src-bex/background.ts L403–418](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/todo-src-bex/src-bex/background.ts:403)。

### RUN-01 单页限制与下一页按钮（保留）

**当前证据：**下一页首次选中点击阻止导航，第二次允许自然导航。SDK按nextPageSelector找按钮/点击/等待，shouldClose限页；重复检测签名前5条，连续重复阈值3。

**合同影响：**保留单页和显式下一页来源；合同列页数与重复终止原因，重复退出不代表完整采集。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js L158–203](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapy/uiManager.js:158)；[scrapyJsChrome/www/popup_crawl.js L1442–1458](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1442)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L107–183](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:107)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L188–225](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:188)。

### RUN-02 无限滚动及未消费设置（不支持）

**当前证据：**infiniteScroll仅将CLOSESPIDER_PAGECOUNT设0/1，未接滚动采集；popup给maxPages=769、MIN_DELAY/MAX_DELAY，但安装SDK ChromeSpider未消费这些三个键，scheduler使用download_delay/config.delay。

**合同影响：**不将checkbox标签/769上限/未消费delay当已有能力。后续各需明确合同与验收。

**证据状态：**`unwired`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L1327–1358](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1327)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L97–105](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:97)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L116–225](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:116)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L855–882](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:855)。

### STOP-01 SDK停止存在但UI与消息未接通（改造）

**当前证据：**SDK stop标stopped/accepting=false并scheduler.stop清queue，回stopping/stopped；release等待owner或资源关闭。后台只存activeScrapyTask Promise，无STOP/PAUSE/RESUME handler，popup无这些提交入口。

**合同影响：**保留停止接纳语义证据，设计runId stop请求/ack/最终状态/部分结果；不宣称立即硬中断全部已发IO。

**证据状态：**`sdk-only`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1228–1235](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1228)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1432–1435](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1432)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1465–1486](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1465)；[scrapyJsChrome/background.js L15754–15761](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15754)；[scrapyJsChrome/background.js L16112–16141](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16112)；[scrapyJsChrome/www/popup_crawl.js L1011–1040](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1011)。

### STOP-02 worker恢复及并行任务无保证（不支持）

**当前证据：**内存activeScrapyTask拒绝第二个任务，完成/异常清空；没有此运行入口的持久化任务注册、checkpoint恢复、按runId停止。

**合同影响：**不支持worker重启后继续旧任务或并行独立任务的产品保证；设计unknown/orphaned结果或限制范围。

**证据状态：**`no-connected-contract`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/background.js L15623](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15623)；[scrapyJsChrome/background.js L16064–16066](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16064)；[scrapyJsChrome/background.js L16112–16141](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:16112)。

### EXP-01 CSV、JSON和复制入口（保留）

**当前证据：**popup将currentData转CSV/pretty JSON，域名命名；CSV用custom header并转义逗号/引号/换行，JSON保留key；复制为CSV；Blob/objectURL/anchor.click触发下载。

**合同影响：**保留这些用户动作；合同列key与label、字段投影/顺序、空数据及下载启动语义。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L189–205](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:189)；[scrapyJsChrome/www/popup_crawl.js L717–746](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:717)；[scrapyJsChrome/www/popup_crawl.js L1838–1864](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1838)。

### EXP-02 发起下载不是确认保存（改造）

**当前证据：**popup下载没有downloadId、完成/失败回执和revokeObjectURL；SDK browser sink回download-initiated，FeedExport记deliveryUnknown；无DOM运行时需explicit sink。

**合同影响：**区分generated/download-initiated/completed/failed/unknown；SDK memory结果不等于文件已落盘。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L189–196](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:189)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1854–1866](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1854)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1901–1933](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1901)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L2052–2065](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:2052)。

### EXP-03 额外格式仅SDK能力（不支持）

**当前证据：**SDK支持json/jsonl/csv/http，依Node fs/DOM/explicit sink；popup仅CSV/JSON，spiderConfig未配置output/exportOptions，没有XLSX/自动云保存/断点导出入口。

**合同影响：**JSONL/HTTP/Node文件写入标SDK-only，不写成当前Browser产品支持。

**证据状态：**`sdk-only`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1841–1881](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1841)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L2045–2065](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:2045)；[scrapyJsChrome/www/popup_crawl.js L1327–1358](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1327)；[scrapyJsChrome/www/popup_crawl.js L1838–1855](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:1838)。

### EXP-04 类型和CSV安全策略不统一（改造）

**当前证据：**popup CSV以String(value)输出，SDK先flatten；两处CSV转义没有公式前缀治理。部分helper将0/false经||变空；popup原生JSON.stringify和SDK校验型stringify不一致。

**合同影响：**合同统一空值/类型/数组/对象策略；审核0、false、换行、公式文本导出样例。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/www/popup_crawl.js L994–1001](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:994)；[scrapyJsChrome/www/popup_crawl.js L724–746](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js:724)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1626–1656](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1626)；[scrapyJsChrome/assets/js/plugins/scrapyJs.js L1659–1678](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/scrapyJs.js:1659)。

### AI-01 AISelectorContract未接入有效链路（不支持）

**当前证据：**独立UMD有request/snapshot与候选字段校验，compileProposal仅允许pagination.none；固定扩展JS/HTML/CJS/JSON搜索未找到加载或调用引用，只有自身AISelectorContract赋值。

**合同影响：**可列设计候选，不可说AI字段、snapshot防过期或候选来源验证已保护popup。

**证据状态：**`unwired`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/assets/js/ai/selector-contract.js L1–12](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/ai/selector-contract.js:1)；[scrapyJsChrome/assets/js/ai/selector-contract.js L44–76](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/ai/selector-contract.js:44)；[scrapyJsChrome/assets/js/ai/selector-contract.js L78–100](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/ai/selector-contract.js:78)；[scrapyJsChrome/background-sw.js L3–21](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js:3)；[scrapyJsChrome/www/popup_crawl.html L7–8](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.html:7)。

### PER-01 浏览器权限与商业许可分开（改造）

**当前证据：**manifest声明<all_urls>/all_frames及scripting/storage/cookies/tabs/history/proxy/webRequest等权限。

**合同影响：**合同明确任务读取/注入/存储/下载边界与不支持页面；manifest权限不能当版权许可或上线批准。

**证据状态：**`reachable-static`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[scrapyJsChrome/manifest.json L18–24](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/manifest.json:18)；[scrapyJsChrome/manifest.json L47–91](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/manifest.json:47)。

### LIC-01 收费发布证据尚未成立（不支持）

**当前证据：**todo有MIT正文，core仅ISC声明且快照scope未包含LICENSE；扩展全范围快照无项目级LICENSE/NOTICE。头注释/lock只提供部分证据。

**合同影响：**禁止宣称可收费上线。补本体、编译/手改衍生、依赖/素材授权和通知，负责人独立审查。

**证据状态：**`evidence-incomplete`；静态判断置信度high，未做浏览器运行验证。

**准确文件行号：**[todo-src-bex/LICENSE L1–21](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/todo-src-bex/LICENSE:1)；[scrapyJs/package.json L69–70](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJs/package.json:69)；[source-ledger.json L1360–1375](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-ledger.json:1360)；[source-ledger.json L1922–1943](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-ledger.json:1922)；[scrapyJsChrome/assets/js/plugins/TraceTimeUtil.js L1–2](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/TraceTimeUtil.js:1)。

## 保留 / 改造 / 不支持清单

| 分类 | 条目 |
| --- | --- |
| 保留 | SRC-01 实际加载入口与历史TS；SEL-01 点击选中整个列表容器；FLD-01 列表容器与字段提取ABI；CFG-01 本地保存恢复已有链路；MSG-01 ID响应和等待超时；MSG-04 手改代码不属于Start执行来源；RUN-01 单页限制与下一页按钮；EXP-01 CSV、JSON和复制入口 |
| 改造 | SRC-02 安装SDK与固定core分叉；SEL-02 有效选区和另一个表格；SEL-03 取消选区未形成消息闭环；SEL-04 模块注入存在静态缺口；SEL-05 活动tab和默认主frame；FLD-02 自动字段依赖首行及选择器字符串；FLD-03 跨行链接图片去重及表头假设；FLD-04 默认title过滤未适配通用字段；PRE-01 手改JSON预览没有重新提取；PRE-02 显示列与导出数据不同；PRE-03 UI运行统计没有完整SDK终态；CFG-02 配置不是版本化完整档案；CFG-03 手改容器可能被旧listSelector覆盖；CFG-04 运行结果反推配置会丢原selector映射；MSG-02 版本、sender和页面授权未闭合；MSG-03 选区事件没有业务快照绑定；STOP-01 SDK停止存在但UI与消息未接通；EXP-02 发起下载不是确认保存；EXP-04 类型和CSV安全策略不统一；PER-01 浏览器权限与商业许可分开 |
| 不支持 | RUN-02 无限滚动及未消费设置；STOP-02 worker恢复及并行任务无保证；EXP-03 额外格式仅SDK能力；AI-01 AISelectorContract未接入有效链路；LIC-01 收费发布证据尚未成立 |

## 实际许可证据与缺口

这里只陈述固定文件中的许可证据，不作法律结论。浏览器manifest权限、第三方头注释、package字段、构建成功及版本匹配均不能代替完整收费发布授权审查。

### todo-src-bex 项目许可

**实际看到：**LICENSE包含Copyright(c)2021 cool-team-official及保留版权/许可通知条件。

**缺口：**正文存在不证明所有vendor、图片、字体、修改和编译衍生均有完整授权链。；package作者标识不同，不能据此确认所有修改者权属。

**文件行号：**[todo-src-bex/LICENSE L1–21](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/todo-src-bex/LICENSE:1)；[todo-src-bex/package.json L1–7](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/todo-src-bex/package.json:1)。

### scrapyJs 项目许可

**实际看到：**package及lock根包声明ISC；author为空。

**缺口：**快照scope未包含LICENSE/NOTICE正文，不能据此断言原仓库不存在许可证。；缺明确版权归属、正文及分发通知依据。

**文件行号：**[scrapyJs/package.json L69–70](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJs/package.json:69)；[scrapyJs/package-lock.json L1–12](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJs/package-lock.json:1)；[source-ledger.json L1360–1375](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-ledger.json:1360)。

### scrapyJsChrome 本体与手改/编译链

**实际看到：**scope=[.]的265个文件无LICENSE/COPYING/NOTICE文件；TraceTimeUtil有Copyright time-review, Inc.注释。

**缺口：**扩展本体许可正文与归属未证明。；编译标记不证明bundle属于todo MIT覆盖范围；当前新增/手改代码作者及授权缺证。；vendor、SDK嵌入依赖、图片、图标、字体完整分发清单未完成。

**文件行号：**[source-ledger.json L7–14](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-ledger.json:7)；[scrapyJsChrome/background.js L15616–15623](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/background.js:15616)；[scrapyJsChrome/assets/js/plugins/TraceTimeUtil.js L1–2](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/plugins/TraceTimeUtil.js:1)。

### 第三方头注释实例

**实际看到：**Socket.IO/Quasar注明MIT；React指上游LICENSE；Lodash/Moment注明MIT；jQuery链接许可。

**缺口：**头注释/URL不是本次读取的上游完整正文；未外网取证。；此处只是实例，不能构成所有vendor/bundle依赖/素材/字体的完整NOTICE。

**文件行号：**[scrapyJsChrome/www/socket.io.js L1–5](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/socket.io.js:1)；[scrapyJsChrome/www/quasar.umd.js L1–5](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/www/quasar.umd.js:1)；[scrapyJsChrome/assets/js/react.development.js L1–9](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/react.development.js:1)；[scrapyJsChrome/assets/js/libs/lodash.min.js L1–8](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/libs/lodash.min.js:1)；[scrapyJsChrome/assets/js/libs/moment.min.js L1–5](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJsChrome/assets/js/libs/moment.min.js:1)；[todo-src-bex/src-bex/assets/js/jquery.min.js L1](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/todo-src-bex/src-bex/assets/js/jquery.min.js:1)。

### core依赖lock元数据

**实际看到：**axios1.15.0、cheerio1.2.0条目声明MIT；webpack5.95.0对应条目未含license字段。

**缺口：**元数据不是版权通知或许可证全文，不证明实际分发SBOM。；缺字段不等于无授权；构建依赖不能自动算进运行时分发。

**文件行号：**[scrapyJs/package-lock.json L1077–1082](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJs/package-lock.json:1077)；[scrapyJs/package-lock.json L1318–1323](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJs/package-lock.json:1318)；[scrapyJs/package-lock.json L4957–4963](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-snapshots/scrapyJs/package-lock.json:4957)。

core lock含根包共414个条目；许可字段统计：`{"0BSD": 1, "<missing>": 279, "Apache-2.0": 2, "BSD-2-Clause": 10, "BSD-3-Clause": 4, "ISC": 5, "MIT": 101, "MPL-2.0": 12}`。这包括构建依赖，仅为声明统计，不能算作实际分发SBOM；缺字段也不能推出无许可。

**收费上线结论：未成立。** 需负责人补扩展本体许可、core正文/版权通知、编译及本地新增/手改代码的归属，以及实际分发vendor/SDK嵌入依赖/图片/图标/字体完整授权和NOTICE清单；使用页面/数据的授权边界也未在本次来源证据中闭合。todo MIT不能自动覆盖整个OpenDesk Browser。

## 面向人的阶段01文档与独立xhigh审查交接

- `solution-overview`：展示选区→字段→preview→保存→RUN→stop→export的数据和身份链；引用本审计ID，明确哪些仅SDK存在、哪些未接通。
- `framework-decision`：引用MV3/MAIN world/worker/安装SDK的实际约束；来源文件本身不足以选定新框架，需独立论证，旧high草稿不作既定结论。
- `task-breakdown`：将输入分叉、module加载、真实preview、配置版本/覆盖、消息身份、stop终态、导出确认、license补证拆成可验收任务；阶段01仍仅合同设计。
- 主代理应安排独立**xhigh review**；当前状态为pending-owner-arrangement。本审计未声称已经通过该review，也不写上述新增文档。
- review重点：SDK hash与来源解释、title过滤、手改预览/完成后配置覆盖、消息身份绑定、stop/下载终态、许可与商业宣称边界。
- 后续验收例子：改selector/key/容器；空结果；相同href/src的两条记录；无表头table；没有title字段；切tab/导航后迟到事件；stop与完成竞争；0/false/数组/对象/换行/公式文本导出；下载取消；worker重启。本次未编写/运行这些实现测试。

## 输出和完成证据

仅写入以下两个文件：

- `/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-audit.md`
- `/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-behaviors.json`

JSON记录每项行为的分类、现状、合同影响、可达性、置信度、绝对路径/起止行号/证据文件SHA-256；包含完整hash分叉及snapshot验证摘要。最终校验已通过：JSON解析有效，171处证据的行号/文件哈希有效，两份输出的33项ID/分类一致（保留8、改造20、不支持5）；SDK receipt覆盖的输入文件清单完整，442个快照文件及ledger再次验证未变。SDK bundle与receipt匹配、core快照五个输入失配。此校验不包含浏览器运行、生产测试或独立review。

未修改原三来源、快照、ledger或其他协作者文件；未安装依赖、提交、运行build/同步脚本或开始生产实现。独立review待主代理安排。
