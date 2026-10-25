// Host-owned Reading TOC permission and visibility copy. Never read from an installable tool package.
import {resolveUiLocale} from './app-localization.js';
const rows=[
  [
    "settingsTitle",
    "工具设置",
    "Tool settings"
  ],
  [
    "languageLabel",
    "界面语言",
    "Interface language"
  ],
  [
    "languageSaveError",
    "语言保存失败：",
    "Could not save language: "
  ],
  [
    "toggleHeading",
    "使用状态",
    "Usage status"
  ],
  [
    "overlayHeading",
    "网页悬浮目录外观",
    "On-page TOC visibility"
  ],
  [
    "websiteHeading",
    "此网站",
    "This website"
  ],
  [
    "pageHeading",
    "仅此页面",
    "This page only"
  ],
  [
    "overlayHint",
    "网站可用且工具启用时显示；隐藏只影响网页悬浮目录，Side Panel 目录仍可使用。两级隐藏规则都恢复后才显示。",
    "Visible when the website and tool are enabled. Hiding only affects the on-page TOC; the Side Panel remains available. Restore both rules to show it again."
  ],
  [
    "advancedHeading",
    "网站停用与页面排除",
    "Disabled websites and excluded pages"
  ],
  [
    "exceptionsHeading",
    "阅读目录已排除的页面",
    "Excluded Reading TOC pages"
  ],
  [
    "siteGroup",
    "当前网站可用性",
    "Availability on this website"
  ],
  [
    "backAction",
    "返回自定义工具列表",
    "Back to tools"
  ],
  [
    "openTabAction",
    "在新标签页打开当前工具",
    "Open current tool in a new tab"
  ],
  [
    "enable",
    "恢复阅读目录",
    "Resume Reading TOC"
  ],
  [
    "disable",
    "停用阅读目录",
    "Pause Reading TOC"
  ],
  [
    "enabledHint",
    "安装后即可使用：普通网页自动显示目录，无需再点击启用或逐网站授权。Chrome 限制或主动停用的页面除外。",
    "Ready after installation: the TOC appears automatically on regular webpages without another enable step or per-site approval, except on restricted or disabled pages."
  ],
  [
    "disabledHint",
    "已停用。网页目录监听停止；网站停用和显示偏好保留。",
    "Disabled. On-page TOC observation has stopped; disabled sites and visibility preferences are preserved."
  ],
  [
    "enableError",
    "启停状态读取异常；已保护性停止运行。",
    "Unable to read tool status; operation has stopped for safety."
  ],
  [
    "launch",
    "查看侧边栏目录",
    "View sidebar TOC"
  ],
  [
    "launchDisabled",
    "已停用，请在设置中启用",
    "Tool disabled; enable it in settings"
  ],
  [
    "selectPage",
    "请选择适用网页",
    "Select a supported webpage"
  ],
  [
    "siteAvailability",
    "当前网站可用性",
    "Availability on this website"
  ],
  [
    "siteEnable",
    "恢复当前网站",
    "Resume on this website"
  ],
  [
    "siteDisable",
    "停用当前网站",
    "Disable on this website"
  ],
  [
    "tocIntro",
    "阅读目录安装后默认适用于普通 HTTP(S) 网页；此处仅管理网站停用、单页排除和恢复，无需逐站授权。",
    "Reading TOC works on regular HTTP(S) pages after installation. These settings only manage site opt-outs, page exclusions and recovery; no per-site approval is required."
  ],
  [
    "unsupportedPage",
    "当前页面不支持目录。",
    "This page does not support the TOC."
  ],
  [
    "siteAvailable",
    "当前网站可用。",
    "This website is enabled."
  ],
  [
    "siteDisabled",
    "当前网站已停用。",
    "This website is disabled."
  ],
  [
    "eyeToolDisabled",
    "工具已停用，请先在设置中启用",
    "Enable the tool in settings first"
  ],
  [
    "eyeUnsupported",
    "请切换到普通 HTTP(S) 网页",
    "Switch to a regular HTTP(S) webpage"
  ],
  [
    "eyeSiteDisabled",
    "当前网站已停用，请在设置中恢复",
    "This website is disabled; restore it in settings"
  ],
  [
    "eyePageExcluded",
    "当前页面已排除，请在设置中恢复",
    "This page is excluded; restore it in settings"
  ],
  [
    "eyeHide",
    "隐藏此网站的悬浮目录",
    "Hide the on-page TOC on this website"
  ],
  [
    "eyeShow",
    "显示此网站的悬浮目录（同时恢复当前页面）",
    "Show the on-page TOC on this website (and restore this page)"
  ],
  [
    "restore",
    "恢复",
    "Restore"
  ],
  [
    "hide",
    "隐藏",
    "Hide"
  ],
  [
    "restoreVisibility",
    "恢复显示",
    "Restore visibility"
  ],
  [
    "disabledSites",
    "已停用的网站",
    "Disabled websites"
  ],
  [
    "noPages",
    "没有排除的页面",
    "No excluded pages"
  ],
  [
    "noSites",
    "没有停用的网站；默认全部可用",
    "No disabled websites; all are enabled by default"
  ],
  [
    "readonly",
    "只读预览",
    "read-only preview"
  ],
  [
    "uninstallPrefix",
    "卸载「",
    "Uninstall “"
  ],
  [
    "uninstallSuffix",
    "」及其本地数据",
    "” and its local data"
  ],
  ['languageAction','语言','Language'],
  ['followLanguage','跟随 OpenDesk 默认语言','Follow OpenDesk default'],
  ['overlayName','悬浮目录','On-page TOC'],
  ['appManagement','应用管理','App management'],
  ['toolEnable','启用工具','Enable tool'],
  ['toolDisable','停用工具','Disable tool'],
  ['toolEnabled','已启用','Enabled'],
  ['toolDisabled','已停用 · 数据保留','Disabled · data retained'],
  ['toolStatusError','状态不可用 · 已暂停执行','Status unavailable · execution paused'],
  ['openTabLabel','在新标签页打开','Open in a new tab'],
  ['languageSaved','语言已保存并立即应用：','Language saved and applied: '],
  ['languageFollowScope','（跟随 OpenDesk 默认语言）',' (follows OpenDesk default)'],
  ['languageToolScope','（仅此工具及其网页界面）',' (only this tool and its on-page UI)']
];
const zh=Object.freeze(Object.fromEntries(rows.map(([key,source])=>[key,source])));
const en=Object.freeze(Object.fromEntries(rows.map(([key,,target])=>[key,target])));
const ja=Object.freeze({
  settingsTitle:'ツール設定',languageLabel:'表示言語',languageSaveError:'言語を保存できませんでした：',
  toggleHeading:'利用状態',overlayHeading:'フローティング目次の表示',websiteHeading:'このサイト',pageHeading:'このページのみ',
  overlayHint:'サイトとツールが有効な場合に表示します。非表示はウェブページの目次のみに適用し、サイドパネルは利用できます。再表示するには両方の非表示設定を解除してください。',
  advancedHeading:'無効なサイトと除外したページ',exceptionsHeading:'目次から除外したページ',siteGroup:'このサイトでの利用可否',
  backAction:'ツール一覧に戻る',openTabAction:'現在のツールを新しいタブで開く',enable:'目次を再開',disable:'目次を無効にする',
  enabledHint:'インストール後、通常のウェブページに目次を自動表示します。追加の有効化やサイトごとの承認は不要です。Chrome の制限や自分で無効にしたページは除きます。',
  disabledHint:'無効です。ページの監視を停止しました。サイトと表示の設定は保持します。',enableError:'利用状態を読み込めないため、安全のため停止しています。',
  launch:'サイドパネルの目次を表示',launchDisabled:'無効です。設定で有効にしてください',selectPage:'対応するウェブページを選択してください',
  siteAvailability:'このサイトでの利用可否',siteEnable:'このサイトで再開',siteDisable:'このサイトで無効にする',
  tocIntro:'インストール後、通常の HTTP(S) ページで目次を利用できます。ここではサイトの無効化、ページの除外と復元を管理します。サイトごとの承認は不要です。',
  unsupportedPage:'このページでは目次を利用できません。',siteAvailable:'このサイトでは有効です。',siteDisabled:'このサイトでは無効です。',
  eyeToolDisabled:'先に設定でツールを有効にしてください',eyeUnsupported:'通常の HTTP(S) ページに切り替えてください',
  eyeSiteDisabled:'このサイトは無効です。設定で再開してください',eyePageExcluded:'このページは除外されています。設定で復元してください',
  eyeHide:'このサイトのフローティング目次を非表示',eyeShow:'このサイトのフローティング目次を表示（現在のページも復元）',
  restore:'復元',hide:'非表示',restoreVisibility:'再表示',disabledSites:'無効なサイト',noPages:'除外したページはありません',
  noSites:'無効なサイトはありません。既定ではすべて有効です',readonly:'読み取り専用プレビュー',uninstallPrefix:'「',uninstallSuffix:'」とローカルデータを削除',
  languageAction:'言語',followLanguage:'OpenDesk の既定言語に従う',overlayName:'フローティング目次',appManagement:'アプリ管理',
  toolEnable:'ツールを有効にする',toolDisable:'ツールを無効にする',toolEnabled:'有効',toolDisabled:'無効 · データを保持',
  toolStatusError:'状態を取得できません · 実行停止中',openTabLabel:'新しいタブで開く',languageSaved:'言語を保存し、適用しました：',
  languageFollowScope:'（OpenDesk の既定言語に従う）',languageToolScope:'（このツールとウェブページの表示のみ）'
});
const messages=Object.freeze({'zh-CN':zh,en,ja});
export const READING_TOC_HOST_KEYS=Object.freeze(Object.keys(zh));
export function readingTocHostText(locale,key){
  if(!Object.hasOwn(zh,key))return '';
  return messages[resolveUiLocale(locale,Object.keys(messages),'zh-CN')][key]||zh[key];
}
