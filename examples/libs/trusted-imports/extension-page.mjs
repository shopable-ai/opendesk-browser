// Trusted extension HTML page: dependencies belong to THIS WXT entry graph.
// Do not assume they were injected by Controller or a Page USER_SCRIPT.
import {uniq,words} from 'lodash-es';

export function renderTrustedExtensionPageTitle(node,title){
  if(!node||typeof node.textContent!=='string')
    throw new TypeError('A real text container is required');
  if(typeof title!=='string')
    throw new TypeError('A title string is required');
  node.textContent=uniq(words(title)).join(' · ');
  return node.textContent;
}
