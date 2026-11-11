// Compatibility entry for old bundled marketplace tabs and bookmarks.
// Public browsing always belongs to the online site. Only ?intent=...
// keeps the existing trusted, extension-owned installation review flow.
import {OFFICIAL_STORE_WEBSITE} from './store-website.js';

export function handleLegacyMarketEntry({
  location=globalThis.location,
  document=globalThis.document,
  website=OFFICIAL_STORE_WEBSITE
}={}){
  if(location?.pathname!=='/ui/marketplace.html'||
    new URLSearchParams(location?.search||'').has('intent'))return false;

  if(website.status==='ready'){
    try{location.replace(website.url);return true;}
    catch{/* Do not fall through into the bundled marketplace. */}
  }

  const header=document?.querySelector?.('.market-header');
  if(header)header.hidden=true;
  const footer=document?.querySelector?.('.market-shell footer');
  if(footer)footer.hidden=true;

  const root=document?.getElementById?.('market-root');
  if(root){
    // Use only text nodes; never render a remote page or accept a URL from
    // query/hash strings. No install, grant or Side Panel action occurs here.
    root.replaceChildren();
    const heading=document.createElement('h1');
    heading.textContent='官方扩展商店尚未上线';
    const note=document.createElement('p');
    note.textContent=website.status==='invalid'
      ?'官方商店网址配置无效，请联系维护者。'
      :'目前还没有可访问的官方商店网址，暂不能打开在线商店。';
    root.append(heading,note);
  }
  return true;
}
