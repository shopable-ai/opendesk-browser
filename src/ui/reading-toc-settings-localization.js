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
