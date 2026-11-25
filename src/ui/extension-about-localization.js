const messages={
  'zh-CN':{title:'关于此扩展',installedVersion:'已安装版本',installableVersion:'可安装版本',releaseVersion:'候选版本',
    unknownVersion:'版本未记录',author:'作者',homepage:'开发者网站',supportUrl:'支持链接',newTab:'在新标签页打开'},
  'zh-TW':{title:'關於此擴充功能',installedVersion:'已安裝版本',installableVersion:'可安裝版本',releaseVersion:'候選版本',
    unknownVersion:'版本未記錄',author:'作者',homepage:'開發者網站',supportUrl:'支援連結',newTab:'在新分頁開啟'},
  en:{title:'About this extension',installedVersion:'Installed version',installableVersion:'Installable version',releaseVersion:'Candidate version',
    unknownVersion:'Version not recorded',author:'Author',homepage:'Developer website',supportUrl:'Support link',newTab:'Opens in a new tab'},
  ja:{title:'この拡張機能について',installedVersion:'インストール済みバージョン',installableVersion:'インストール可能なバージョン',releaseVersion:'候補バージョン',
    unknownVersion:'バージョンの記録なし',author:'作者',homepage:'開発者のウェブサイト',supportUrl:'サポートリンク',newTab:'新しいタブで開く'}
};
export const extensionAboutText=(locale,key)=>(messages[locale]||messages['zh-CN'])[key];
