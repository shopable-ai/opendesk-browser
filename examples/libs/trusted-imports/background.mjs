// Example of code COPIED into an approved Background/WXT entry, not auto-loaded.
// In trusted extension source, dependencies are explicit ESM imports; there
// is no Controller page/params or magically installed global dayjs/_.
import dayjs from 'dayjs';
import {words} from 'lodash-es';

export function summarizeTrustedBackgroundEvent(tabUrl, observedAt=new Date()){
  const url=new URL(tabUrl);
  if(!['http:','https:'].includes(url.protocol))throw new TypeError('HTTP(S) page expected');
  return Object.freeze({
    origin:url.origin,
    hostWords:words(url.hostname.replaceAll('.',' ')),
    date:dayjs(observedAt).format('YYYY-MM-DD')
  });
}
