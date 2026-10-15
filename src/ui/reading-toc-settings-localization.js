// Host-owned Reading TOC permission and visibility copy. Never read from an installable tool package.
import {resolveUiLocale} from './app-localization.js';
const rows=[
  [
    "settingsTitle",
    "工具设置",
    "Tool settings"
  ],
  [
    "toggleHeading",
    "工具启停",
    "Tool availability"
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
    "已有授权与页面例外",
    "Website access and page exceptions"
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
    "启用工具",
    "Enable tool"
  ],
  [
    "disable",
    "停用工具",
    "Disable tool"
  ],
  [
    "enabledHint",
    "工具已启用。启用不会自动运行代码。",
    "Tool enabled. Enabling does not automatically run code."
  ],
  [
    "disabledHint",
    "工具已停用。数据、网站授权和显示偏好保留。",
    "Tool disabled. Saved data, website access, and visibility preferences are retained."
  ],
  [
    "enableError",
    "启停状态读取异常；已保护性停止运行。",
    "Unable to read tool status; operation has stopped for safety."
  ],
  [
    "launch",
    "打开工具",
    "Open tool"
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
    "启用当前网站",
    "Enable on this website"
  ],
  [
    "siteDisable",
    "停用当前网站",
    "Disable on this website"
  ],
  [
    "tocIntro",
    "阅读目录默认可用于所有 HTTP(S) 网页；可在此停用当前网站或排除单页。",
    "Reading TOC is available on HTTP(S) pages by default. You can disable this website or exclude an individual page."
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
  ]
];
const zh=Object.freeze(Object.fromEntries(rows.map(([key,source])=>[key,source])));
const en=Object.freeze(Object.fromEntries(rows.map(([key,,target])=>[key,target])));
const messages=Object.freeze({'zh-CN':zh,en});
export const READING_TOC_HOST_KEYS=Object.freeze(Object.keys(zh));
export function readingTocHostText(locale,key){
  if(!Object.hasOwn(zh,key))return '';
  return messages[resolveUiLocale(locale,['zh-CN','en'],'zh-CN')][key]||zh[key];
}
