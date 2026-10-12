// Trusted Side Panel HOST example: ordinary build-time imports only.
// NEVER import/call this from an installed opaque Sidebar tool iframe.
import {parseUrl} from 'query-string';
import dayjs from 'dayjs';

export function formatTrustedSidebarStatus(rawURL, observedAt=new Date()){
  const parsed=parseUrl(rawURL);
  const tags=parsed.query.tag;
  const count=Array.isArray(tags)?tags.length:tags===undefined?0:1;
  return String(dayjs(observedAt).format('YYYY-MM-DD'))+
    ' · '+parsed.url+' · '+count+' tag(s)';
}
