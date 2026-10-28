// Small trusted Side Panel catalog: avoid bundling full Workspace dictionaries for top tabs.
export const SIDEBAR_NAV_MESSAGES=Object.freeze({
  "en":Object.freeze({
    "sidebar.navigation": "Workbench",
    "sidebar.navigationHint": "Scroll horizontally on narrow screens; use the arrow, Home and End keys to switch tabs.",
    "sidebar.tab.tasks": "My",
    "sidebar.tab.tools": "Extensions",
    "sidebar.tab.workflow": "Workflows",
    "sidebar.tab.develop": "Develop",
    "sidebar.tab.appDebug": "App Debug",
    "sidebar.tab.cloud": "Cloud",
    "sidebar.tab.debug": "Debug"
  }),
  "zh-CN":Object.freeze({
    "sidebar.navigation": "工作台",
    "sidebar.navigationHint": "较窄时可以横向滚动；左右方向键以及 Home、End 切换页签",
    "sidebar.tab.tasks": "我的",
    "sidebar.tab.tools": "扩展",
    "sidebar.tab.workflow": "工作流",
    "sidebar.tab.develop": "开发",
    "sidebar.tab.appDebug": "应用调试",
    "sidebar.tab.cloud": "云控",
    "sidebar.tab.debug": "调试"
  }),
  "zh-TW":Object.freeze({
    "sidebar.navigation": "工作台",
    "sidebar.navigationHint": "較窄時可以水平捲動；使用左右方向鍵及 Home、End 切換分頁",
    "sidebar.tab.tasks": "我的",
    "sidebar.tab.tools": "擴充功能",
    "sidebar.tab.workflow": "工作流程",
    "sidebar.tab.develop": "開發",
    "sidebar.tab.appDebug": "應用程式偵錯",
    "sidebar.tab.cloud": "雲端控制",
    "sidebar.tab.debug": "偵錯"
  }),
  "ja":Object.freeze({
    "sidebar.navigation": "ワークベンチ",
    "sidebar.navigationHint": "幅が狭い場合は横スクロールできます。左右の矢印キーと Home、End でタブを切り替えます。",
    "sidebar.tab.tasks": "マイ",
    "sidebar.tab.tools": "拡張機能",
    "sidebar.tab.workflow": "ワークフロー",
    "sidebar.tab.develop": "開発",
    "sidebar.tab.appDebug": "アプリデバッグ",
    "sidebar.tab.cloud": "クラウド",
    "sidebar.tab.debug": "デバッグ"
  }),
});

export function translateSidebarNavigation(key,locale='zh-CN'){
  return SIDEBAR_NAV_MESSAGES[locale]?.[key]??SIDEBAR_NAV_MESSAGES['zh-CN']?.[key]??'';
}
