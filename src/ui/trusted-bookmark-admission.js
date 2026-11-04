// Select only the statically compiled Bookmark Manager component.
// Installed package HTML/CSS/JS is never an executable input to this route.
import {admitsInstalledSidebarTool} from './sidebar-tools/installation.js';

export const TRUSTED_BOOKMARK_ID='bookmark-manager';
// Build configuration injects the reviewed component source version as a
// literal. It is a component marker, never an installed-package version gate.
export const TRUSTED_BOOKMARK_VERSION=
  typeof __OPENDESK_TRUSTED_BOOKMARK_VERSION__==='string'
    ?__OPENDESK_TRUSTED_BOOKMARK_VERSION__:'0.3.14';
export const TRUSTED_BOOKMARK_COMPONENT_VERSION='R3.3';
export function bookmarkSandboxNotice(){
 return '当前使用兼容界面：安装包、能力、启停状态或安装代际未通过核验。请检查安装状态后重新打开。';
}
export async function admitsTrustedBookmark({
 tool,installed,enableRecords,epochs,expectedEpoch
}={}){
 return admitsInstalledSidebarTool({tool,installed,enableRecords,epochs,expectedEpoch,
  id:TRUSTED_BOOKMARK_ID,capabilities:['browser.bookmarks.full','currentPage.read']});
}
