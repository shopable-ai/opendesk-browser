# 旧代码复用的阶段01决策

reviewed-design-decisions; independent final delta approved; product acceptance not-run

复用以不可变captured bytes及实际符号/行号为依据，绝不拿后续current源码证明旧SDK等价。baseline SDK与receipt自洽但27输入5分叉；overlay代则27输入7分叉；最终交接已记录25文件后来变更，02B/03迁入前只读diff与影响review。分叉不是license或来源签名证明。

| 审计项 | 阶段01决定/新模块 | owner | 回归输入 |
|---|---|---|---|
|C01 Rule callback/follow semantics|adapt → src/features/scraping/compiler/rule-plan.js|03|CORE-R01|
|C02 Request normalization and copying|adapt → src/features/scraping/compiler/request-plan.js|03|CORE-R02|
|C03 Item schema and acceptance shape|adapt → src/features/scraping/compiler/record-schema.js|03|CORE-R03,CORE-R04|
|C04 ItemLoader extraction and explicit text delta|adapt → src/features/scraping/compiler/extraction-plan.js|03|CORE-R03|
|C04-02B ItemLoader extraction and explicit text delta platform boundary|adapt → src/agents/page-agent.js|02B|CORE-R03|
|C05 Ordered pipeline with stop/filter semantics|adapt → src/features/scraping/runner/pipeline.js|03|CORE-R04|
|C06 Scheduler eligibility, deduplication and single shared page|adapt → src/features/scraping/runner/queue.js|03|CORE-R05|
|C06-02B Scheduler eligibility, deduplication and single shared page platform boundary|adapt → src/platform/page-port/|02B|CORE-R05|
|C07 Scheduler page-limit admission and failure delta|adapt → src/features/scraping/runner/budgets.js|03|CORE-R06|
|C08 Scrapy owner, stop and classified accounting|adapt → src/features/scraping/runner/accounting.js|03|CORE-R04,CORE-R06|
|C08-02B Scrapy owner, stop and classified accounting platform boundary|adapt → src/run-host.js|02B|CORE-R04,CORE-R06|
|C09 ChromeSpider DOM pagination intent|adapt → src/features/scraping/runner/pagination.js|03|CORE-R07|
|C09-02B ChromeSpider DOM pagination intent platform boundary|adapt → src/agents/page-agent.js|02B|CORE-R07|
|C10 ListSpider URL pagination and request inheritance|adapt → src/features/scraping/compiler/pagination-plan.js|03|CORE-R02,CORE-R07|
|C11 ExportManager pure JSON/CSV utilities|adapt → src/features/scraping/formatter/json.js|03|CORE-R08|
|C12 FeedExport serialization and acknowledgement boundary|adapt → src/features/scraping/formatter/index.js|03|CORE-R09|
|C12-02B FeedExport serialization and acknowledgement boundary platform boundary|adapt → src/platform/downloads/|02B|CORE-R09|
|T01 Todo completion envelope and pending-call map|adapt → src/platform/page-port/|02B|CORE-R10|
|T02 Todo browser read helpers and detached DOM limits|adapt → src/agents/page-agent.js|02B|CORE-R03,CORE-R10|
|T03 Todo navigation and bounded polling intent|adapt → src/platform/target/|02B|CORE-R10|
|T04 Todo synthetic click/type behavior|defer → src/agents/page-agent.js|02B|CORE-R07,CORE-R10|
|T05 Todo Chrome local storage promise shape|adapt → src/platform/storage/preferences.js|02B|CORE-R10|
|T06 Todo listener lifecycle pattern and missing teardown|adapt → src/agents/page-agent.js|02B|CORE-R10|
|T07 Todo resource/CustomEvent bridge is a boundary to replace|drop → src/platform/page-port/|02B|CORE-R10|
|T08 Scope exclusions: account, HID, Android/Capacitor and broad manifest|drop → EXCLUDED: no todo account/native/device/build subtree in target package|02A|CORE-R10|
|EXT-R01 openOrFocusPopupWindow / createPopupWindow / getPopupCrawlUrl|adapt → src/ui/tool-shell.js;02B subsequently src/platform/host/|02A|EXT-T01|
|EXT-R02 top controls / tab-button / data-table / configArea / headerSettingsContainer|keep → src/features/scraping/ui/|03|EXT-S02|
|EXT-R03 window.initListSelector / window.ListSelector / window.selector|adapt → src/features/scraping/selection/**; independent classic build entry owned by platform|03|EXT-T09|
|EXT-R04 ListDetector.detectLists / candidate score / duplicate and nested filters|adapt → src/features/scraping/selection/list-detector.js|03|EXT-S04|
|EXT-R05 ListSelector.next / highlight / selectListBySelector|adapt → src/features/scraping/selection/list-selector.js|03|EXT-T10|
|EXT-R06 UIManager.getNextButtonByClick / startNextButtonSelection|adapt → src/features/scraping/selection/ui-manager.js|03|EXT-T02,EXT-T13|
|EXT-R07 UIManager.startTableSelection|adapt → src/features/scraping/selection/ui-manager.js|03|EXT-T03,EXT-T13|
|EXT-R08 SelectorUtils.getClassNameString / generateSelector|adapt → src/features/scraping/selection/selector-utils.js|03|EXT-T02|
|EXT-R09 TableDataExtractor.getTableData / extractTableData / processTableElement|adapt → src/features/scraping/selection/table-data-extractor.js|03|EXT-T03|
|EXT-R10 processedHrefs / processedSrcs / processDirectLinks / processDirectImages|adapt → src/features/scraping/selection/table-data-extractor.js|03|EXT-T11|
|EXT-R11 sendSelectorToExtension / sendTableDataToExtension|adapt → src/features/scraping/selection/** + src/platform/page-port/**|03|EXT-T12,EXT-T13|
|EXT-R12 sendRuntimeMessageWithProtocol / unwrapRuntimeResponse|adapt → src/platform/page-port/** + src/ui/tool-shell.js|02B|EXT-T06|
|EXT-R13 TableDataHandler.setTableData / getTableHeaders / updateHeaderInputs|keep → src/features/scraping/ui/**|03|EXT-T04,EXT-T17|
|EXT-R14 applyValidatedConfig / CrawlProfileUI.apply / undo / profileLabelChange|adapt → src/features/scraping/templates/** + src/features/scraping/ui/**|03|EXT-T07,EXT-T15|
|EXT-R15 processDataAndConfig / refreshPreview / buildSpiderConfig / generatePureCrawlerCode|defer → src/features/scraping/compiler/**|03|EXT-T14,EXT-T15|
|EXT-R16 bindSharedPageToTab / handleChromePageExecute / ensureSelectorSupport / loadSelectorDependencies|adapt → src/platform/target/** + src/platform/page-port/** + src/agents/page-agent.js|02B|EXT-T09,EXT-T12|
|EXT-R17 handleScrapyJsRun / getScrapyStatusSnapshot / handleScrapyJsControl|adapt → src/run-host.js + src/platform/journal/**; domain runner adapter|02B|EXT-T14,EXT-T16|
|EXT-R18 scrapyJsPopupControls.status / pause / resume / stop / reconcileStoredRunState|adapt → src/features/scraping/ui/|03|EXT-T08,EXT-T16,EXT-T17|
|EXT-R19 normalizeScrapyRunPayload / mapRunStatusToUi / getRunResultCounts / result handler|adapt → src/features/scraping/ui/run-state.js|03|EXT-T08,EXT-T17|
|EXT-R20 TableDataHandler.toCSV / toJSON / exportCsv / exportJson / copyAll|adapt → src/features/scraping/formatter/** + src/features/scraping/ui/**|03|EXT-T05,EXT-T18|
|EXT-R21 downloadFile|drop → src/platform/downloads/**|02B|EXT-T18|
|EXT-R22 pendingListRevision / pendingNextRevision / updateCodeArea / loadedRevision guard|adapt → src/features/scraping/ui/** + src/features/scraping/selection/**|03|EXT-T07,EXT-T12|
|EXT-R23 scrapyJsHelper.js historical ListSelector|drop → no migrated helper file; selection build dependency list only|02A|EXT-T09|
|EXT-R24 ChromePage.goto / click / _waitForElement / evaluate / _execute|adapt → src/platform/page-port/** + src/agents/page-agent.js|02B|EXT-S24|
|EXT-R25 validateRequest row sample indexes / AI_SELECTOR_SERVICE / AI DOM panel|defer → future src/features/scraping/ui/ suggestions adapter only, not first release|03|EXT-S25|
|EXT-R02-02A top controls / tab-button / data-table / configArea / headerSettingsContainer ownership boundary|adapt → src/ui/tool.html + src/ui/tool-shell.js|02A|EXT-S02|
|EXT-R03-02A window.initListSelector / window.ListSelector / window.selector ownership boundary|adapt → static build manifest/selection-entry slot|02A|EXT-T09|
|EXT-R11-02B sendSelectorToExtension / sendTableDataToExtension ownership boundary|adapt → src/platform/page-port/** + src/agents/page-agent.js|02B|EXT-T12,EXT-T13|
|EXT-R17-03 handleScrapyJsRun / getScrapyStatusSnapshot / handleScrapyJsControl ownership boundary|adapt → src/features/scraping/runner/**|03|EXT-T14,EXT-T16|

选区/ListSelector/uiManager/字段/预览布局优先保留；公共权限和source-target桥归02B，选区交互/同compiler/产品UI归03。完整来源细节在reuse-decision.json及source-audit/source-behaviors。

动态边逐条选择有限公开接口或排除，transfer decision不再“以后再定”。每条仍是待实测迁入，不能把source-confirmed或tool caller边写成新产品passed。

许可与商业单列发布门禁；本地设计/实现可继续，未声明分发权利完整。
