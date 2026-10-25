import {createChatGPTControllerSite} from './site.js';
import {runCalculationRelay} from './relay.js';

// Public Controller lexical capabilities; no website MAIN or private Host RPC.
export default async function main() {
  return runCalculationRelay({site:createChatGPTControllerSite(page), store:AppStorage, params});
}
