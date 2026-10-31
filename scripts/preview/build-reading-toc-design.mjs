#!/usr/bin/env node
// Design authoring only: two editable regions in the existing Preview Kit.
// No production source, installation, SDK, browser or persistent user data.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {createPreviewKit, checkPreview} from '../sidebar-preview-kit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = 'examples/sidebar-tools/reading-toc/preview/reading-toc-r23-design.html';
const SOURCE = 'scripts/preview/build-reading-toc-design.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');

const appHTML = `
<p class="od-alert" data-g="languageScope">本轮仅实施多语言文案与作用域传播。现设计仅作语言演示参考；布局、Switch 与目录核心行为不在本轮改造范围。</p>
<div class="preview-reading-workbench">
  <section class="preview-reading-page od-stack" aria-labelledby="article-label">
    <div class="preview-reading-row"><strong id="article-label" class="od-title" data-g="article">模拟文章 · 章节名保持原文</strong><span class="od-note">example.invalid / reading</span></div>
    <div id="article-stage" class="preview-reading-stage od-surface">
      <article id="reading-article" class="preview-reading-article" tabindex="0" aria-label="模拟文章">
        <section class="preview-reading-chapter" id="chapter-1"><h2 class="od-title" tabindex="-1">把注意力留给阅读</h2><p class="od-body">一篇关于阅读与注意力的示例文章。目录帮助读者找到位置，而不是替代文章本身。</p><p class="od-note">The article is user content. 見出しと本文は原文のままです。</p></section>
        <section class="preview-reading-chapter" id="chapter-2"><h2 class="od-title" tabindex="-1">01 从结构开始</h2><p class="od-body">先看到全貌，再决定从哪里读起。主要章节呈现文章骨架，完整目录保留每一层标题。</p></section>
        <section class="preview-reading-chapter" id="chapter-3"><h3 class="od-title" tabindex="-1">找到当前章节</h3><p class="od-body">当前位置让长文阅读有连续感。切换界面语言不会移动文章位置。</p></section>
        <section class="preview-reading-chapter" id="chapter-4"><h2 class="od-title" tabindex="-1">02 让界面退后一步</h2><p class="od-body">在需要时出现，在阅读时保持安静。显示偏好、网站可用性与整个工具的停用是三种不同的决定。</p></section>
        <section class="preview-reading-chapter" id="chapter-5"><h3 class="od-title" tabindex="-1">语言与阅读习惯</h3><p class="od-body">工具界面可以使用熟悉的语言，文章标题和正文始终保持作者原文。</p></section>
        <section class="preview-reading-chapter" id="chapter-6"><h2 class="od-title" tabindex="-1">03 留下清晰的反馈</h2><p class="od-body">只有确定保存成功，界面才显示成功。结果未知时先重读，不自动重放写入。</p></section>
      </article>
      <aside id="reading-overlay" class="preview-reading-overlay od-surface od-surface--padded od-stack" data-dock="top-right" aria-labelledby="overlay-title">
        <header class="od-page-head"><h2 class="od-page-title" id="overlay-title"></h2><button type="button" id="overlay-drag" class="od-icon-button preview-reading-handle" aria-label="移动浮层" title="移动浮层"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7-7 7 7M5 15l7 7 7-7M2 12h20M12 2v20"/></svg></button></header>
        <p class="od-note" id="drag-help"></p>
        <div id="overlay-body" class="od-stack"></div>
      </aside>
    </div>
    <p id="article-feedback" class="od-note" role="status" aria-live="polite"></p>
  </section>
  <section class="preview-reading-device od-surface od-surface--padded preview-reading-flow" aria-labelledby="panel-title">
    <header class="od-page-head preview-reading-row"><div class="preview-reading-actions"><button type="button" id="panel-back" class="od-icon-button" aria-label="返回"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><h2 id="panel-title" class="od-page-title" tabindex="-1">阅读目录</h2></div><div id="panel-actions" class="preview-reading-actions"></div></header>
    <div id="panel-body" class="preview-reading-flow"></div>
    <p id="panel-feedback" class="od-note" role="status" aria-live="polite"></p>
  </section>
  <details id="reading-diagnostics" class="preview-reading-diagnostics od-disclosure od-disclosure--flat">
    <summary data-g="diagnostics">设计模拟控制 · 非正式设备</summary>
    <div class="od-stack">
      <p class="od-note" data-g="simulation">仅内存模拟；不连接真实网站、权限、语言服务或磁盘。AI 服务未接通。</p>
      <div class="preview-reading-grid">
        <div><label for="design-scenario" data-g="scenario">相关状态</label><select class="od-field" id="design-scenario"></select></div>
        <div><label for="design-pack-state" data-g="packScenario">语言资源</label><select class="od-field" id="design-pack-state"></select></div>
      </div>
      <p class="od-note" data-g="unknownHelp">结果未知时，所有写入锁定；显式重读仅取回状态，不自动重试。</p>
      <p class="od-technical" data-g="evidence">离线设计稿；浏览器交互、原生扩展、独立六维评分：NOT_TESTED。</p>
    </div>
  </details>
</div>`;

// This function is serialized, never executed by the builder. All state is local
// to this document. Strings inserted into markup are escaped, including the
// simulated user-supplied import. Article DOM is never replaced on UI updates.
function readingDesignBehavior(aiCatalog) {
  'use strict';
  const root = document.getElementById('od-preview-app');
  const $ = id => document.getElementById(id);
  const names = {'zh-CN':'简体中文',en:'English',ja:'日本語','zh-TW':'繁體中文'};
  const copy = {
    'zh-CN': {
      languageScope:'本轮仅实施多语言文案与作用域传播。现设计仅作语言演示参考；布局、Switch 与目录核心行为不在本轮改造范围。',tool:'阅读目录',language:'语言',settings:'设置',back:'返回',close:'关闭',open:'打开阅读目录',extensions:'扩展',listNote:'返回列表后可重新打开，选择在本页内存中保留。',
      article:'模拟文章 · 章节名保持原文',articleLabel:'模拟文章，可滚动',simulation:'仅内存模拟；不连接真实网站、权限、语言服务或磁盘。AI 服务未接通。',
      diagnostics:'设计模拟控制 · 非正式设备',scenario:'相关状态',packScenario:'语言资源',evidence:'离线设计稿；浏览器交互、原生扩展、独立六维评分：NOT_TESTED。',
      modes:['主要','当前','全部','AI'],modeNames:['主要章节','当前章节及其子章节','全部章节','AI 整理目录（设计模拟）'],modeGroup:'目录模式',
      modeHints:['文章的主要章节','当前章节及其子章节','文章中的全部章节','会员与合作信息沿用当前产品；设计稿未连接服务'],
      refresh:'刷新目录',reread:'重新读取',recovered:'已重新读取模拟状态。未重放任何写入。',ready:'章节已就绪',empty:'未发现可识别章节。可刷新目录。',error:'读取失败。请显式重新读取。',permission:'缺少网站权限。请在真实扩展中管理访问权限；此处不会申请授权。',loading:'正在读取章节…',saveFail:'保存失败；上次已保存的选择保持不变。请恢复正常状态后重试。',unknown:'保存结果未知。写入已锁定，请先重新读取；不会自动重试。',
      siteBlocked:'此网站已停用。网站设置决定是否可用，与浮层显示偏好不同。',disabled:'整个工具已停用，侧栏与浮层均不可用。可在设置恢复。',hidden:'浮层已隐藏；阅读目录仍可在 Side Panel 使用。',
      located:'已定位章节：',position:'移动浮层',dragHelp:'拖动可吸附至四角；方向键移动，Home 归位。',dock:'浮层已移动：',docks:['右上','右下','左上','左下'],
      global:'OpenDesk 默认语言',globalHelp:'影响跟随默认语言的工具。此管理面板使用默认语言。',toolLanguage:'此工具语言',follow:'跟随 OpenDesk',independent:'仅此工具',scope:'作用范围',scopeFollow:'跟随全局偏好',scopeIndependent:'独立设置，仅阅读目录',requested:'请求语言',effective:'实际生效',saved:'已保存到本页模拟数据',memory:'关闭并重开本面板会保留选择；重载整份文档会清空。',
      globalFallback:'管理界面暂不支持繁中，实际使用简体中文；默认偏好仍为繁中。',missingPack:'缺少请求语言包，工具已回退到简体中文。',missingWords:'缺少部分词条，相关词条显示英文原文。',complete:'补全语言包',maintenance:'添加或管理语言包',maintenanceHelp:'维护目标不会切换工具界面语言。导入前必须预览，删除前必须确认。',target:'维护目标',installed:'已安装资源',builtin:'内置，不可删除',notInstalled:'未安装',draft:'语言包 JSON（离线模拟）',previewImport:'预览导入',previewTitle:'确认导入此语言包？',previewHelp:'只改变当前维护目标的模拟语言资源；不改全局偏好或此工具语言选择。',confirmImport:'确认导入',cancel:'取消',cancelled:'已取消；模拟数据未变更。',imported:'语言包已导入模拟内存。',delete:'删除语言包',deleteTitle:'确认删除此语言包？',deleteHelp:'删除后，使用此语言的阅读目录将回退到简体中文。此操作仅影响模拟内存。',confirmDelete:'确认删除',deleted:'语言包已从模拟内存删除。',invalid:'请输入有效 JSON：locale 必须匹配维护目标，messages 需包含非空 tool 与 refresh 文本。',protected:'通用安全文案使用可信内置译文，导入包不能覆盖。',
      display:'网页显示',siteDisplay:'在此网站显示浮层',pageDisplay:'在此页面显示浮层',displayHelp:'仅影响文章旁浮层；不会停用工具或网站能力。',pageAddress:'当前页面：example.invalid / reading',siteAvailability:'网站可用性',available:'在此网站允许使用阅读目录',availabilityHelp:'关闭后，此网站的目录停止工作；显示偏好会保留。',exceptions:'网站例外',noExceptions:'本设计只有 example.invalid 这一模拟网站。',management:'通用应用管理',toolEnabled:'启用此工具',toolHelp:'关闭会停用所有网站上的此工具，保留显示与语言偏好。',switchOn:'开',switchOff:'关',
      normalState:'正常',emptyState:'空数据',errorState:'读取失败',permissionState:'权限不足',loadingState:'加载中',saveFailState:'保存失败',unknownState:'结果未知',longState:'长文本',completeState:'完整资源',missingPackState:'缺包（日本語）',missingWordsState:'缺词（当前工具语言）',unknownHelp:'结果未知时，所有写入锁定；显式重读仅取回状态，不自动重试。',
      previewScope:'交互预览 · 模拟数据 · 未安装。保存与删除只改变本页内存；重载文档后清空。',stateGroup:'模拟状态',revokedState:'授权撤销',busyState:'处理中',longHint:'（模拟长标题，用于检查自然换行与完整可读性）'
    },
    en: {
      languageScope:'Implementation scope: multilingual copy and language-scope propagation only. This design is a language demonstration reference; layout, Switch replacement and core outline behavior are outside this iteration.',tool:'Reading outline',language:'Language',settings:'Settings',back:'Back',close:'Close',open:'Open reading outline',extensions:'Extensions',listNote:'Reopen the tool here. Your choices remain in this document’s memory.',
      article:'Simulated article · headings stay in their original language',articleLabel:'Simulated article, scrollable',simulation:'Memory-only simulation. No live website, permissions, language service or disk access. AI is disconnected.',
      diagnostics:'Design simulation controls · outside the device',scenario:'Relevant state',packScenario:'Language resources',evidence:'Offline design. Browser interaction, native extension and independent six-dimension review: NOT_TESTED.',
      modes:['Main','Current','All','AI'],modeNames:['Main sections','Current section and subsections','All sections','AI outline (design simulation)'],modeGroup:'Outline mode',modeHints:['Main sections of this article','Current section and its subsections','Every heading in the article','Current membership and partnership content; this design is disconnected'],
      refresh:'Refresh outline',reread:'Read again',recovered:'Simulated state read again. No write was replayed.',ready:'Sections are ready',empty:'No recognizable sections. You can refresh the outline.',error:'Could not read the outline. Read again explicitly.',permission:'Website permission is missing. Manage access in the real extension; this design cannot grant access.',loading:'Reading sections…',saveFail:'Could not save. Your last saved choices remain unchanged. Return to the normal state before trying again.',unknown:'Save result unknown. Writes are locked. Read again first; no automatic retry.',siteBlocked:'This website is disabled. Availability is separate from floating outline display preferences.',disabled:'The tool is disabled across all websites and both surfaces. Restore it in Settings.',hidden:'The floating outline is hidden. You can still use the Side Panel outline.',
      located:'Located section: ',position:'Move floating outline',dragHelp:'Drag to snap to a corner; arrow keys move, Home resets.',dock:'Outline moved: ',docks:['top right','bottom right','top left','bottom left'],
      global:'OpenDesk default language',globalHelp:'Applies to tools that follow the default. This management panel uses the default language.',toolLanguage:'This tool’s language',follow:'Follow OpenDesk',independent:'Only this tool',scope:'Scope',scopeFollow:'Follows the global preference',scopeIndependent:'Independent; reading outline only',requested:'Requested language',effective:'Actually displayed',saved:'Saved to this document’s simulated data',memory:'Closing and reopening this panel keeps your choices. Reloading this document clears them.',globalFallback:'This manager does not support Traditional Chinese; it displays Simplified Chinese. The default preference remains Traditional Chinese.',missingPack:'Requested language pack is missing. The tool falls back to Simplified Chinese.',missingWords:'Some terms are missing. Those terms display their English source text.',complete:'Complete language pack',maintenance:'Add or manage language packs',maintenanceHelp:'The maintenance target does not change the interface language. Preview imports and confirm deletions.',target:'Maintenance target',installed:'Installed resources',builtin:'Built in; cannot be deleted',notInstalled:'Not installed',draft:'Language pack JSON (offline simulation)',previewImport:'Preview import',previewTitle:'Import this language pack?',previewHelp:'Changes only the simulated resources for this maintenance target. Your default and tool language selections stay unchanged.',confirmImport:'Confirm import',cancel:'Cancel',cancelled:'Cancelled. Simulated data is unchanged.',imported:'Language pack imported into simulated memory.',delete:'Delete language pack',deleteTitle:'Delete this language pack?',deleteHelp:'The reading outline will fall back to Simplified Chinese if it uses this language. This affects simulated memory only.',confirmDelete:'Confirm deletion',deleted:'Language pack deleted from simulated memory.',invalid:'Enter valid JSON: locale must match the maintenance target; messages must include nonempty tool and refresh text.',protected:'Shared safety messages use trusted built-in translations. Imported packs cannot override them.',
      display:'Display on webpages',siteDisplay:'Show floating outline on this website',pageDisplay:'Show floating outline on this page',displayHelp:'Affects only the article’s floating outline. The tool and website capability remain available.',pageAddress:'Current page: example.invalid / reading',siteAvailability:'Website availability',available:'Allow reading outline on this website',availabilityHelp:'Turning this off stops the outline on this website. Display preferences are kept.',exceptions:'Website exceptions',noExceptions:'This design contains only the simulated example.invalid website.',management:'General app management',toolEnabled:'Enable this tool',toolHelp:'Turning this off disables this tool on every website. Display and language choices are kept.',switchOn:'On',switchOff:'Off',
      normalState:'Normal',emptyState:'Empty',errorState:'Read error',permissionState:'Permission missing',loadingState:'Loading',saveFailState:'Save failure',unknownState:'Unknown result',longState:'Long text',completeState:'Complete resources',missingPackState:'Missing pack (日本語)',missingWordsState:'Missing terms (current tool language)',unknownHelp:'Unknown results lock all writes. Explicitly reading again retrieves state without retrying a write.',previewScope:'Interactive preview · simulated data · not installed. Save and delete affect this page’s memory; reloading clears it.',stateGroup:'Simulated state',revokedState:'Access revoked',busyState:'Busy',longHint:' (simulated long heading to check natural wrapping and complete readability)'
    },
    ja: {
      languageScope:'今回の実装は多言語の文言と言語設定の適用範囲の反映のみです。この設計は言語デモの参考です。レイアウト、Switch の置き換え、目次の中核動作は対象外です。',tool:'目次',language:'言語',settings:'設定',back:'戻る',close:'閉じる',open:'目次を開く',extensions:'拡張機能',listNote:'ここから再度開けます。選択はこの文書のメモリに保持されます。',article:'記事のシミュレーション · 見出しは原文のまま',articleLabel:'スクロールできる模擬記事',simulation:'メモリ内のシミュレーションです。実際のサイト、権限、言語サービス、ディスクには接続しません。AI は未接続です。',diagnostics:'設計のシミュレーション操作 · 端末の外側',scenario:'関連する状態',packScenario:'言語リソース',evidence:'オフライン設計。ブラウザ操作、実際の拡張機能、独立した6項目の評価：NOT_TESTED。',
      modes:['主要','現在','すべて','AI'],modeNames:['主要な見出し','現在の節と小見出し','すべての見出し','AI による目次（設計のシミュレーション）'],modeGroup:'目次モード',modeHints:['記事の主要な見出し','現在の節とその小見出し','記事のすべての見出し','現行の会員・パートナー情報です。設計はサービスに未接続です'],refresh:'目次を更新',reread:'再読み込み',recovered:'模擬状態を再読み込みしました。書き込みは再実行していません。',ready:'見出しを読み込みました',empty:'見出しが見つかりません。目次を更新できます。',error:'読み込めませんでした。明示的に再読み込みしてください。',permission:'サイトへのアクセス権限がありません。実際の拡張機能で管理してください。この設計で権限は付与できません。',loading:'見出しを読み込み中…',saveFail:'保存できませんでした。前回の選択を維持しています。通常状態に戻してから再試行してください。',unknown:'保存結果が不明です。書き込みを停止しています。先に再読み込みしてください。自動再試行はしません。',siteBlocked:'このサイトでは無効です。利用可否とフローティング目次の表示設定は別です。',disabled:'すべてのサイトと表示面でツールが無効です。設定から再開できます。',hidden:'フローティング目次は非表示です。サイドパネルの目次は利用できます。',located:'移動した見出し：',position:'フローティング目次を移動',dragHelp:'ドラッグで四隅に配置。方向キーで移動、Home で元の位置へ。',dock:'目次を移動：',docks:['右上','右下','左上','左下'],
      global:'OpenDesk の既定言語',globalHelp:'既定に従うツールに適用します。この管理画面も既定言語を使用します。',toolLanguage:'このツールの言語',follow:'OpenDesk に従う',independent:'このツールのみ',scope:'適用範囲',scopeFollow:'全体の設定に従う',scopeIndependent:'独立設定、目次のみに適用',requested:'要求した言語',effective:'実際の表示言語',saved:'この文書の模擬データに保存しました',memory:'この画面を閉じて開き直しても選択は保持されます。文書を再読み込みすると消去されます。',globalFallback:'管理画面は繁体字中国語に未対応のため、簡体字中国語で表示します。既定の選択は繁体字中国語のままです。',missingPack:'要求した言語パックがありません。簡体字中国語で表示しています。',missingWords:'一部の翻訳がありません。該当する項目は英語の原文で表示します。',complete:'言語パックを補完',maintenance:'言語パックの追加と管理',maintenanceHelp:'管理対象を変えても表示言語は変わりません。インポートはプレビュー、削除は確認が必要です。',target:'管理対象の言語',installed:'インストール済みのリソース',builtin:'組み込み、削除不可',notInstalled:'未インストール',draft:'言語パック JSON（オフラインのシミュレーション）',previewImport:'インポートをプレビュー',previewTitle:'この言語パックをインポートしますか？',previewHelp:'管理対象の模擬リソースのみを変更します。既定言語とツール言語の選択は変更しません。',confirmImport:'インポートを確定',cancel:'キャンセル',cancelled:'キャンセルしました。模擬データは変更していません。',imported:'言語パックを模擬メモリに追加しました。',delete:'言語パックを削除',deleteTitle:'この言語パックを削除しますか？',deleteHelp:'この言語を使用する目次は簡体字中国語に戻ります。模擬メモリのみを変更します。',confirmDelete:'削除を確定',deleted:'言語パックを模擬メモリから削除しました。',invalid:'有効な JSON を入力してください。locale は管理対象と一致し、messages に空でない tool と refresh が必要です。',protected:'共通の安全メッセージは信頼済みの組み込み翻訳です。インポートでは上書きできません。',
      display:'ウェブページでの表示',siteDisplay:'このサイトで目次を表示',pageDisplay:'このページで目次を表示',displayHelp:'記事のフローティング目次のみを変更します。ツールとサイトの利用可否は変わりません。',pageAddress:'現在のページ：example.invalid / reading',siteAvailability:'サイトでの利用可否',available:'このサイトで目次の利用を許可',availabilityHelp:'オフにすると、このサイトの目次が停止します。表示設定は保持されます。',exceptions:'サイトの例外',noExceptions:'この設計には模擬サイト example.invalid のみが含まれます。',management:'アプリの共通管理',toolEnabled:'このツールを有効にする',toolHelp:'オフにすると、すべてのサイトでツールが停止します。表示と言語の設定は保持されます。',switchOn:'オン',switchOff:'オフ',
      normalState:'通常',emptyState:'データなし',errorState:'読み込み失敗',permissionState:'権限なし',loadingState:'読み込み中',saveFailState:'保存失敗',unknownState:'結果不明',longState:'長いテキスト',completeState:'完全なリソース',missingPackState:'パックなし（日本語）',missingWordsState:'一部の翻訳なし（現在のツール言語）',unknownHelp:'結果が不明な場合、書き込みを停止します。再読み込みは状態の取得のみで、書き込みは再実行しません。',previewScope:'操作できるプレビュー · 模擬データ · 未インストール。保存と削除はこの文書のメモリのみを変更し、再読み込みで消去されます。',stateGroup:'模擬状態',revokedState:'権限を取り消し',busyState:'処理中',longHint:'（自然な折り返しと全文の読みやすさを確認するための長い模擬見出し）'
    }
  };
  // Product AI copy comes from the existing catalog, not a new AI design.
  for (const locale of ['zh-CN','en','ja']) Object.assign(copy[locale],aiCatalog[locale]);
  const keys = Object.keys(copy['zh-CN']);
  for (const lang of ['en','ja']) if (keys.some(key => !(key in copy[lang]))) throw Error('Incomplete design translation: '+lang);
  const state = {global:'zh-CN',tool:'follow',view:'tool',scenario:'normal',packs:new Set(['zh-CN','en','ja']),imports:{},missingTerms:false,maintenance:false,target:'ja',draft:'',confirm:null,current:1,modes:{overlay:0,panel:0},siteDisplay:true,pageDisplay:true,siteAvailable:true,enabled:true,dock:'top-right',feedback:null,located:false,viewScroll:{}};
  const chapters = [
    {id:1,title:'把注意力留给阅读',depth:1,parent:1},
    {id:2,title:'01 从结构开始',depth:1,parent:2},
    {id:3,title:'找到当前章节',depth:2,parent:2},
    {id:4,title:'02 让界面退后一步',depth:1,parent:4},
    {id:5,title:'语言与阅读习惯',depth:2,parent:4},
    {id:6,title:'03 留下清晰的反馈',depth:1,parent:6}
  ];
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const globalLang = () => copy[state.global] ? state.global : 'zh-CN';
  const requested = () => state.tool === 'follow' ? state.global : state.tool;
  const actual = () => state.packs.has(requested()) ? requested() : 'zh-CN';
  const tr = (key,owner='tool') => {
    const lang = owner === 'global' ? globalLang() : actual();
    if(owner === 'tool' && state.missingTerms && key === 'refresh') return copy.en.refresh;
    return owner === 'tool' && state.imports[lang]?.[key] || (copy[lang] || copy['zh-CN'])[key];
  };
  const writeBlocked = () => ['loading','error','permission','unknown'].includes(state.scenario);
  const focus = id => {
    let el = $(id);
    if(!el || el.disabled || el.closest('[hidden]') || el.closest('details:not([open])') && el.tagName !== 'SUMMARY') el = $('panel-title');
    el.focus({preventScroll:true});
  };
  const btn = (id,key,owner='tool',kind='secondary',extra='') => '<button type="button" id="'+id+'" class="od-button od-button--'+kind+'" '+extra+'>'+esc(tr(key,owner))+'</button>';
  const option = (value,label,selected) => '<option value="'+esc(value)+'"'+(selected?' selected':'')+'>'+esc(label)+'</option>';
  const languageOptions = selected => Object.entries(names).map(([value,label])=>option(value,label,selected===value)).join('');
  function field(id,key,options,value,owner='global',disabled=false) {
    return '<div class="od-form-field"><label class="od-field-label" for="'+id+'">'+esc(tr(key,owner))+'</label><select class="od-field" id="'+id+'"'+(disabled?' disabled':'')+'>'+options(value)+'</select></div>';
  }
  function sw(id,key,value,owner='tool',disabled=false) {
    // Existing React Aria Switch slots/visuals; this offline design simulates
    // only the role, selected attribute and Space/Enter behavior.
    return '<div class="preview-reading-row"><span id="'+id+'-label" class="od-body">'+esc(tr(key,owner))+'</span><div id="'+id+'" class="od-shared-switch" role="switch" tabindex="'+(disabled?'-1':'0')+'" aria-labelledby="'+id+'-label" aria-checked="'+value+'" aria-disabled="'+disabled+'"'+(value?' data-selected="true"':'')+(disabled?' data-disabled="true"':'')+'><span class="od-shared-switch-thumb" aria-hidden="true"></span></div><span class="od-note">'+esc(tr(value?'switchOn':'switchOff',owner))+'</span></div>';
  }
  function modeGroup(surface) {
    return '<div class="od-segmented preview-reading-modes" role="radiogroup" aria-label="'+esc(tr('modeGroup'))+'">'+tr('modes').map((name,i)=>'<button type="button" class="od-button od-button--'+(state.modes[surface]===i?'secondary':'quiet')+'" id="mode-'+surface+'-'+i+'" role="radio" aria-checked="'+(state.modes[surface]===i)+'" tabindex="'+(state.modes[surface]===i?'0':'-1')+'" aria-label="'+esc(tr('modeNames')[i])+'" title="'+esc(tr('modeNames')[i])+'" data-mode="'+i+'" data-surface="'+surface+'">'+esc(name)+'</button>').join('')+'</div>';
  }
  function outline(surface) {
    let html = modeGroup(surface);
    let statusKey = !state.enabled ? 'disabled' : !state.siteAvailable ? 'siteBlocked' : ['loading','empty','error','permission','unknown'].includes(state.scenario) ? state.scenario : null;
    if(statusKey) return html+'<p class="od-alert'+(['error','permission','unknown'].includes(statusKey)?' od-alert--warning':'')+'" role="'+(['error','permission','unknown'].includes(statusKey)?'alert':'status')+'">'+esc(tr(statusKey))+'</p>';
    if(state.modes[surface]===3) {
      const t = key => esc(tr(key));
      return html+'<section class="od-surface od-surface--padded od-stack" aria-label="'+t('memberTitle')+'"><div class="preview-reading-row"><strong class="od-title">'+t('memberTitle')+'</strong><span class="od-note">'+t('memberTag')+'</span></div><p class="od-body">'+t('memberDescription')+'</p><p class="od-alert" role="status">'+t('memberUnavailableMeta')+'</p><p class="od-note">'+t('memberUnavailableDisclaimer')+'</p></section><section class="od-surface od-surface--padded od-stack" aria-label="'+t('promoRecruit')+'"><p class="od-note">'+t('recruitBrand')+' · '+t('recruitKind')+'</p><h2 class="od-title">'+t('recruitTitle')+'</h2><p class="od-body">'+t('recruitDescription')+'</p></section><p class="od-note" role="status">'+t('aiUnavailableFooter')+'</p>';
    }
    const parent = chapters.find(ch=>ch.id===state.current).parent;
    const visible = chapters.filter(ch=>state.modes[surface]===0 ? ch.depth===1 : state.modes[surface]===1 ? ch.parent===parent : true);
    html += '<p class="od-note">'+esc(tr('modeHints')[state.modes[surface]])+'</p><nav class="preview-reading-list" aria-label="'+esc(tr('tool'))+'">';
    html += visible.map(ch=>'<button type="button" id="chapter-'+surface+'-'+ch.id+'" class="od-button od-button--'+(state.current===ch.id?'secondary':'quiet')+'" data-chapter="'+ch.id+'" data-depth="'+ch.depth+'"'+(state.current===ch.id?' aria-current="location"':'')+'>'+esc(ch.title+(state.scenario==='long'?tr('longHint'):''))+'</button>').join('');
    return html+'</nav>';
  }
  function languageView() {
    const g = key => esc(tr(key,'global'));
    let html = field('global-language','global',languageOptions,state.global,'global',writeBlocked())+'<p class="od-note">'+g('globalHelp')+'</p>';
    if(state.global==='zh-TW') html+='<p class="od-alert">'+g('globalFallback')+'</p>';
    html += field('tool-language','toolLanguage',selected=>option('follow',tr('follow','global'),selected==='follow')+Object.entries(names).map(([value,label])=>option(value,tr('independent','global')+' · '+label,selected===value)).join(''),state.tool,'global',writeBlocked());
    html += '<div class="od-result od-stack"><p class="od-body">'+g('effective')+' · <strong>'+esc(names[actual()])+'</strong></p><p class="od-note">'+g('requested')+' · '+esc(names[requested()])+'<br>'+g('scope')+' · '+g(state.tool==='follow'?'scopeFollow':'scopeIndependent')+'</p></div>';
    if(actual()!==requested()) html+='<p class="od-alert od-alert--warning" role="status">'+g('missingPack')+'</p>'+btn('complete-pack','complete','global');
    if(state.missingTerms) html+='<p class="od-alert od-alert--warning" role="status">'+g('missingWords')+'</p>'+btn('complete-words','complete','global');
    html+='<p class="od-note">'+g('memory')+'</p><details id="language-maintenance" class="od-disclosure"'+(state.maintenance?' open':'')+'><summary id="maintenance-summary">'+g('maintenance')+'</summary><div class="od-stack"><p class="od-note">'+g('maintenanceHelp')+'</p>';
    html+=field('maintenance-target','target',languageOptions,state.target,'global',Boolean(state.confirm));
    html+='<p class="od-note">'+g('installed')+' · '+Object.entries(names).map(([locale,label])=>esc(label)+' ('+esc(state.packs.has(locale) ? ['zh-CN','en'].includes(locale)?tr('builtin','global'):tr('installed','global') : tr('notInstalled','global'))+')').join(' · ')+'</p>';
    html+='<label class="od-field-label" for="import-json">'+g('draft')+'</label><textarea class="od-field" id="import-json" rows="5" maxlength="4000" aria-describedby="import-error"'+(writeBlocked()||state.confirm?' disabled':'')+'>'+esc(state.draft)+'</textarea><p id="import-error" class="od-field-error" role="alert" hidden></p>';
    html+='<div class="preview-reading-actions">'+btn('preview-import','previewImport','global','secondary',writeBlocked()||state.confirm?'disabled':'')+btn('delete-pack','delete','global','danger',writeBlocked()||state.confirm||!state.packs.has(state.target)||['zh-CN','en'].includes(state.target)?'disabled':'')+'</div><p class="od-note">'+g('protected')+'</p></div></details>';
    if(state.confirm) {
      const importing = state.confirm.kind==='import';
      html += '<section class="od-surface od-surface--padded od-stack" id="confirmation" role="region" aria-labelledby="confirm-title"><h2 class="od-title" id="confirm-title" tabindex="-1">'+g(importing?'previewTitle':'deleteTitle')+'</h2><strong class="od-body">'+esc(names[state.confirm.target])+'</strong><p class="od-note">'+g(importing?'previewHelp':'deleteHelp')+'</p>';
      if(importing) html += '<pre>'+esc(JSON.stringify(state.confirm.data,null,2))+'</pre>';
      html+='<div class="preview-reading-actions">'+btn('confirm-action',importing?'confirmImport':'confirmDelete','global',importing?'secondary':'danger',writeBlocked()?'disabled':'')+btn('cancel-confirm','cancel','global')+'</div></section>';
    }
    return html;
  }
  function settingsView() {
    const t = key => esc(tr(key));
    return '<section class="od-stack">'+btn('settings-language','language')+'<h2 class="od-title">'+t('display')+'</h2><p class="od-note">example.invalid</p>'+sw('site-display','siteDisplay',state.siteDisplay,'tool',writeBlocked())+sw('page-display','pageDisplay',state.pageDisplay,'tool',writeBlocked())+'<p class="od-note">'+t('displayHelp')+'</p><p class="od-note">'+t('pageAddress')+'</p></section><section class="od-stack"><h2 class="od-title">'+t('siteAvailability')+'</h2>'+sw('site-available','available',state.siteAvailable,'tool',writeBlocked())+'<p class="od-note">'+t('availabilityHelp')+'</p></section><details class="od-disclosure"><summary>'+t('exceptions')+'</summary><p class="od-note">'+t('noExceptions')+'</p></details><section class="od-stack"><h2 class="od-title">'+esc(tr('management','global'))+'</h2>'+sw('tool-enabled','toolEnabled',state.enabled,'global',writeBlocked())+'<p class="od-note">'+esc(tr('toolHelp','global'))+'</p></section>';
  }
  function render(focusId) {
    const active = document.activeElement?.id;
    const articleTop = $('reading-article').scrollTop;
    const deviceTop = root.querySelector('.preview-reading-device').scrollTop;
    const owner = ['language','list'].includes(state.view)?'global':'tool';
    $('panel-title').textContent = tr(state.view==='tool'?'tool':state.view==='list'?'extensions':state.view,owner);
    $('panel-title').lang = owner==='global'?globalLang():actual();
    $('panel-body').lang = owner==='global'?globalLang():actual();
    $('panel-actions').innerHTML = state.view==='tool' ? btn('open-language','language','global')+btn('open-settings','settings') : state.view==='language' ? btn('close-language','close','global','quiet') : '';
    $('panel-back').hidden = state.view==='list';
    $('panel-back').setAttribute('aria-label',tr('back',owner));
    $('panel-back').title = tr('back',owner);
    $('panel-body').innerHTML = state.view==='language' ? languageView() : state.view==='settings' ? settingsView() : state.view==='list' ? '<p class="od-note">'+esc(tr('listNote','global'))+'</p>'+btn('reopen-tool','open','global') : '<div class="preview-reading-row"><p class="od-note">Side Panel · example.invalid</p>'+btn('refresh-outline','refresh','tool','quiet',state.scenario==='loading'?'disabled':'')+'</div>'+outline('panel');
    $('overlay-title').textContent = tr('tool');
    $('reading-overlay').lang = actual();
    $('overlay-drag').setAttribute('aria-label',tr('position'));
    $('overlay-drag').title = tr('position');
    $('overlay-drag').setAttribute('aria-describedby','drag-help');
    $('drag-help').textContent = tr('dragHelp');
    $('reading-overlay').hidden = !state.siteDisplay||!state.pageDisplay||!state.siteAvailable||!state.enabled;
    $('reading-overlay').dataset.dock = state.dock;
    $('overlay-body').innerHTML = outline('overlay');
    $('reading-article').setAttribute('aria-label',tr('articleLabel','global'));
    $('article-feedback').textContent = !state.enabled ? tr('disabled') : !state.siteAvailable ? tr('siteBlocked') : !state.siteDisplay||!state.pageDisplay ? tr('hidden') : ['loading','empty','error','permission','unknown'].includes(state.scenario) ? tr(state.scenario) : state.located ? tr('located')+chapters.find(ch=>ch.id===state.current).title : tr('ready');
    for(const el of root.querySelectorAll('[data-g]')) el.textContent=tr(el.dataset.g,'global');
    $('design-scenario').innerHTML = ['normal','empty','error','permission','loading','saveFail','unknown','long'].map(v=>option(v,tr(v+'State','global'),state.scenario===v)).join('');
    const packScenario = !state.packs.has('ja')?'missingPack':state.missingTerms?'missingWords':'complete';
    $('design-pack-state').innerHTML = ['complete','missingPack','missingWords'].map(v=>option(v,tr(v+'State','global'),packScenario===v)).join('');
    const previewState = document.getElementById('preview-state');
    previewState.setAttribute('aria-label',tr('stateGroup','global'));
    previewState.querySelector('span').textContent=tr('stateGroup','global');
    const stateKeys = {ready:'normal',empty:'empty',error:'error',revoked:'permission',busy:'loading',long:'long'};
    for(const b of previewState.querySelectorAll('[data-state]')) {
      b.textContent=tr(({ready:'normal',empty:'empty',error:'error',revoked:'revoked',busy:'busy',long:'long'})[b.dataset.state]+'State','global');
      const selected = stateKeys[b.dataset.state]===state.scenario;
      b.setAttribute('aria-pressed',String(selected));
      b.classList.toggle('od-button--secondary',!selected);
    }
    const declaration = root.parentElement.querySelector('aside');
    declaration.textContent = tr('previewScope','global');
    declaration.setAttribute('aria-label',tr('stateGroup','global'));
    root.setAttribute('aria-label',tr('tool','global'));
    const feedbackKey = state.scenario==='saveFail'?'saveFail':state.scenario==='unknown'?'unknown':state.feedback;
    $('panel-feedback').textContent = feedbackKey ? tr(feedbackKey,owner)+(feedbackKey==='saved'?' · '+names[actual()]+' · '+tr(state.tool==='follow'?'scopeFollow':'scopeIndependent',owner):'') : '';
    $('panel-feedback').setAttribute('role',['saveFail','unknown'].includes(feedbackKey)?'alert':'status');
    // Preserve both independent scroll owners. Language/mode changes never scroll
    // article content; focus restoration never calls scrollIntoView here.
    $('reading-article').scrollTop = articleTop;
    root.querySelector('.preview-reading-device').scrollTop = deviceTop;
    if(focusId||active) focus(focusId||active);
  }
  function write(action,focusId) {
    if(writeBlocked()) return;
    if(state.scenario==='saveFail') { state.feedback='saveFail'; render(focusId); return; }
    action(); state.feedback='saved'; render(focusId);
  }
  function sample(locale) {
    return JSON.stringify({locale,messages:{tool:(copy[locale]||copy['zh-CN']).tool,refresh:(copy[locale]||copy['zh-CN']).refresh}},null,2);
  }
  function enter(view,origin) {
    state.feedback=null;
    state.viewScroll[state.view]=root.querySelector('.preview-reading-device').scrollTop;
    state.view=view;
    if(view==='language') {
      state.languageOrigin=origin;
      state.languageParent=origin==='settings-language'?'settings':'tool';
      state.maintenance=false; state.confirm=null;
      state.target=actual(); state.draft=sample(state.target);
    }
    render('panel-title');
    root.querySelector('.preview-reading-device').scrollTop=0;
  }
  function cancelConfirmation() {
    const origin=state.confirm?.kind==='import'?'preview-import':'delete-pack';
    state.confirm=null; state.feedback='cancelled'; render(state.maintenance?origin:'maintenance-summary');
  }
  function leave() {
    if(state.confirm) {cancelConfirmation();return;}
    if(state.view==='language') {state.view=state.languageParent;state.feedback=null;render(state.languageOrigin);root.querySelector('.preview-reading-device').scrollTop=state.viewScroll[state.view]||0;}
    else if(state.view==='settings') {state.view='tool';state.feedback=null;render('open-settings');root.querySelector('.preview-reading-device').scrollTop=state.viewScroll.tool||0;}
    else if(state.view==='tool') {state.view='list';state.feedback=null;render('reopen-tool');}
  }
  root.addEventListener('click', event=>{
    const el=event.target.closest('button,[role="switch"]');
    if(!el||el.disabled||el.getAttribute('aria-disabled')==='true') return;
    const id=el.id;
    if(el.dataset.mode!==undefined) {state.modes[el.dataset.surface]=Number(el.dataset.mode);render(id);return;}
    if(el.dataset.chapter) {
      state.current=Number(el.dataset.chapter);state.located=true;
      render(id);
      const target=$('chapter-'+state.current);
      $('reading-article').scrollTop=target.offsetTop-$('reading-article').offsetTop;
      target.querySelector('h2,h3').focus({preventScroll:true});
      return;
    }
    if(id==='open-language'||id==='settings-language') return enter('language',id);
    if(id==='open-settings') return enter('settings',id);
    if(id==='close-language'||id==='panel-back') return leave();
    if(id==='reopen-tool') return enter('tool',id);
    if(id==='refresh-outline'||id==='recover-state') {
      state.scenario='normal';state.feedback='recovered';render(id==='recover-state'?'panel-title':id);return;
    }
    if(id==='complete-pack'||id==='complete-words') {
      state.maintenance=true;state.target=requested();state.draft=sample(state.target);render('maintenance-target');return;
    }
    if(id==='preview-import') {
      if(writeBlocked()) return;
      state.draft=$('import-json').value;
      try {
        const data=JSON.parse(state.draft);
        if(data.locale!==state.target||!data.messages||!['tool','refresh'].every(key=>typeof data.messages[key]==='string'&&data.messages[key].trim()&&data.messages[key].length<=120)) throw Error('invalid');
        // Only two tool-owned strings are accepted by this design sample. Shared
        // trusted labels and safety text cannot be imported or overwritten.
        state.confirm={kind:'import',target:state.target,data:{locale:state.target,messages:{tool:data.messages.tool,refresh:data.messages.refresh}}};
        render('cancel-confirm');
      } catch {
        $('import-error').hidden=false;$('import-error').textContent=tr('invalid','global');
        $('import-json').setAttribute('aria-invalid','true');focus('import-json');
      }
      return;
    }
    if(id==='delete-pack') {if(writeBlocked())return;state.confirm={kind:'delete',target:state.target};render('cancel-confirm');return;}
    if(id==='cancel-confirm') return cancelConfirmation();
    if(id==='confirm-action') {
      const confirm=state.confirm;
      if(!confirm||writeBlocked()) return;
      if(state.scenario==='saveFail') {render(id);return;}
      if(confirm.kind==='import') {state.packs.add(confirm.target);state.imports[confirm.target]=confirm.data.messages;state.missingTerms=false;}
      else {state.packs.delete(confirm.target);delete state.imports[confirm.target];}
      state.confirm=null;state.feedback=confirm.kind==='import'?'imported':'deleted';render('maintenance-summary');return;
    }
    const switches={'site-display':'siteDisplay','page-display':'pageDisplay','site-available':'siteAvailable','tool-enabled':'enabled'};
    if(switches[id]) write(()=>{state[switches[id]]=!state[switches[id]];},id);
  });
  root.addEventListener('input',event=>{if(event.target.id==='import-json')state.draft=event.target.value;});
  root.addEventListener('change',event=>{
    const {id,value}=event.target;
    if(id==='global-language') return write(()=>{state.global=value;},id);
    if(id==='tool-language') return write(()=>{state.tool=value;},id);
    if(id==='maintenance-target') {state.target=value;state.draft=sample(value);state.confirm=null;state.feedback=null;render(id);return;}
    if(id==='design-scenario') {state.scenario=value;state.feedback=null;render(id);return;}
    if(id==='design-pack-state') {
      if(value==='missingPack') state.packs.delete('ja'); else state.packs.add('ja');
      state.missingTerms=value==='missingWords';state.feedback=null;render(id);
    }
  });
  root.addEventListener('toggle',event=>{if(event.target.id==='language-maintenance')state.maintenance=event.target.open;},true);
  root.addEventListener('keydown',event=>{
    const el=event.target;
    if(event.key==='Escape') {if(state.view!=='list'){event.preventDefault();leave();}return;}
    if(el.getAttribute('role')==='switch'&&[' ','Enter'].includes(event.key)) {event.preventDefault();el.click();return;}
    if(el.dataset.mode!==undefined && ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      const mode=Number(el.dataset.mode),key=event.key;
      const next=key==='Home'?0:key==='End'?3:(mode+(['ArrowRight','ArrowDown'].includes(key)?1:3))%4;
      state.modes[el.dataset.surface]=next;render('mode-'+el.dataset.surface+'-'+next);return;
    }
    if(el.id==='overlay-drag'&&['Home','ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault();
      let [vertical,horizontal]=state.dock.split('-');
      if(event.key==='Home') {vertical='top';horizontal='right';}
      if(event.key==='ArrowRight')horizontal='right';if(event.key==='ArrowLeft')horizontal='left';
      if(event.key==='ArrowDown')vertical='bottom';if(event.key==='ArrowUp')vertical='top';
      dock(vertical+'-'+horizontal);
    }
  });
  function dock(value) {
    state.dock=value;$('reading-overlay').dataset.dock=value;
    $('article-feedback').textContent=tr('dock')+tr('docks')[['top-right','bottom-right','top-left','bottom-left'].indexOf(value)];
  }
  let pointer=null;
  $('overlay-drag').addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
    $('overlay-drag').setPointerCapture(event.pointerId);
  });
  $('overlay-drag').addEventListener('pointerup',event=>{
    if(!pointer||event.pointerId!==pointer.id)return;
    if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>8) {
      const rect=$('article-stage').getBoundingClientRect();
      dock((event.clientY>rect.top+rect.height/2?'bottom':'top')+'-'+(event.clientX>rect.left+rect.width/2?'right':'left'));
    }
    pointer=null;
  });
  $('overlay-drag').addEventListener('pointercancel',()=>{pointer=null;});
  document.getElementById('preview-state').addEventListener('click',event=>{
    const b=event.target.closest('[data-state]');if(!b)return;
    state.scenario=({ready:'normal',empty:'empty',error:'error',revoked:'permission',busy:'loading',long:'long'})[b.dataset.state];state.feedback=null;render(b.id||'panel-title');
  });
  // Recovery belongs to the design workbench, outside the simulated device.
  const recovery=document.createElement('button');recovery.id='recover-state';recovery.type='button';recovery.className='od-button od-button--secondary';recovery.dataset.g='reread';
  $('reading-diagnostics').querySelector('.od-stack').append(recovery);
  state.draft=sample('ja');
  render();
}

export async function buildReadingTocDesign() {
  const kit = await createPreviewKit({title:'阅读目录 R23 · 交互设计模拟'});
  const $ = load(kit.html);
  $('#od-preview-app').html(appHTML);
  const aiInputs = ['examples/sidebar-tools/reading-toc/locales.json','examples/sidebar-tools/reading-toc/languages/ja.opendesk-locale.json','examples/sidebar-tools/reading-toc/src/main.js','examples/sidebar-tools/reading-toc/trusted/view.js'];
  const aiSources = await Promise.all(aiInputs.map(path=>readFile(resolve(ROOT,path),'utf8')));
  const catalog=JSON.parse(aiSources[0]),japanese=JSON.parse(aiSources[1]);
  const aiKeys=['memberTitle','memberTag','memberDescription','memberUnavailableMeta','memberUnavailableDisclaimer','promoRecruit','recruitBrand','recruitKind','recruitTitle','recruitDescription','aiUnavailableFooter'];
  const aiCatalog=Object.fromEntries(['zh-CN','en','ja'].map(locale=>[locale,Object.fromEntries(aiKeys.map(key=>{
    const value=locale==='ja'?japanese.messages[key]?.text:locale==='en'?catalog.messages.en[key]?.text:catalog.messages['zh-CN'][key];
    if(typeof value!=='string') throw Error('Missing AI product translation: '+locale+'/'+key);
    return [key,value];
  }))]));
  const sharedBehavior=$('#od-preview-behavior').text().split('/* DESIGN_APP_BEHAVIOR */')[0];
  $('#od-preview-behavior').text(sharedBehavior+'/* DESIGN_APP_BEHAVIOR */\n('+readingDesignBehavior.toString()+')('+JSON.stringify(aiCatalog).replace(/</g,'\\u003c')+');');
  const html = $.html();
  const check = await checkPreview(html);
  if (!check.ok) throw Error('Reading design contract failed: '+check.errors.join('; '));
  const [source,design] = await Promise.all([readFile(resolve(ROOT,SOURCE),'utf8'),readFile(resolve(ROOT,'DESIGN.md'),'utf8')]);
  const manifest = {...kit.manifest,htmlHash:digest(html),designSource:{path:SOURCE,sha256:digest(source)},brief:{path:'DESIGN.md',sha256:digest(design),rubric:'frozen six dimensions; each five items / 20 points'},output:OUTPUT,regenerate:'node scripts/preview/build-reading-toc-design.mjs',simulation:'IN_MEMORY_ONLY; NO_REAL_CHROME_SDK_NETWORK_OR_STORAGE',aiProductSources:Object.fromEntries(aiInputs.map((path,i)=>[path,digest(aiSources[i])])),aiBehavior:'Existing membership unavailable + partner cards; no model, checkout, generation, cancellation or invented output',framework:'Existing HTML Preview Kit; canonical React Aria Switch CSS slots, simulated behavior only',staticCheck:check,browserInteraction:'NOT_TESTED — user-owned',independentReview:'NOT_SCORED',sourceParity:'DESIGN_ONLY_NOT_PRODUCTION_SOURCE_BOUND',implementationScope:'LANGUAGE_ONLY: multilingual copy and scope propagation; no Switch replacement, layout rebuild or core TOC changes',coreBehavior:'ILLUSTRATIVE_ONLY: preserve existing production AI, indexing, mode semantics, navigation, scrolling, dragging and permission handlers; this simulator is not a replacement specification',widthZoomMatrix:'OUT_OF_SCOPE'};
  return {html,manifest};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const result=await buildReadingTocDesign();
  const output=resolve(ROOT,OUTPUT);
  await mkdir(dirname(output),{recursive:true});
  // The requested manifest is saved alongside the complete HTML, never a package.
  await writeFile(output,result.html);
  await writeFile(output.replace(/\.html$/,'.manifest.json'),JSON.stringify(result.manifest,null,2)+'\n');
  console.log(JSON.stringify({output,manifest:output.replace(/\.html$/,'.manifest.json'),bytes:Buffer.byteLength(result.html),check:result.manifest.staticCheck.ok,evidence:'STATIC_CONTRACT_ONLY'}));
}
