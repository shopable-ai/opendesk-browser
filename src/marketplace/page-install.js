// Retired page-DOM approval protocol. Keep bounded read-only reconciliation for
// historical pageReview records; no token or trusted webpage click approves an install.
import {validateMarketSender} from './external.js';
import {MARKET_INTENTS_STORE,UUID,marketError,validateMarketSubject,readMarketIntentStore} from './intent.js';
import {readMarketInstallStatus} from './status.js';
export const MARKET_PAGE_PROTOCOL='opendesk.market.page.v1';
export function validatePageInstallMessage(value){
  if(!value||value.protocol!==MARKET_PAGE_PROTOCOL||value.action!=='STATUS'||
    Object.keys(value).sort().join(',')!==['protocol','action','intentId','subject'].sort().join(',')||
    typeof value.intentId!=='string'||!UUID.test(value.intentId))
    throw marketError('E_REVIEW_REQUIRED','请在 OpenDesk 通用可信页确认安装；网页仅可查询原结果。');
  const subject=validateMarketSubject(value.subject);
  if(subject.kind!=='app')throw marketError('E_INTENT_FIELDS','此查询只支持应用。');
  return {...value,subject};
}
export function createPageInstallHost({api=globalThis.chrome,channel}={}){
  return {async handle(raw,sender){
    const request=validatePageInstallMessage(raw);
    const origin=await validateMarketSender(api,sender,await channel,true);
    const state=readMarketIntentStore((await api.storage.local.get(MARKET_INTENTS_STORE))[MARKET_INTENTS_STORE]);
    const row=state.intents.find(item=>item.intentId===request.intentId);
    if(!row||row.origin!==origin||JSON.stringify(row.subject)!==JSON.stringify(request.subject))
      throw marketError('E_INTENT_CONFLICT','查询与原安装交接不一致。');
    return {ok:true,protocol:MARKET_PAGE_PROTOCOL,intentId:row.intentId,...await readMarketInstallStatus(api,row)};
  }};
}
