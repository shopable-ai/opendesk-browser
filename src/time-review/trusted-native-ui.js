// Statically bundled first-party Time Review UI. HTML and logic have ONE
// source shared with the ordinary, still-sandboxed package. Nothing is read
// from the installed tool's html/css/js fields or imported at runtime.
import html from '../../examples/sidebar-tools/time-review/src/index.html?raw';
import '../../examples/sidebar-tools/time-review/src/main.js';
import {TRUSTED_TIME_REVIEW_VERSION} from './trusted-admission.js';

export const trustedTimeReviewUI=Object.freeze({
  version:TRUSTED_TIME_REVIEW_VERSION,
  mount({doc,container,request}){
    if(typeof request!=='function'||!container||typeof doc?.createElement!=='function')
      throw Error('Trusted Time Review native host is unavailable');
    const factory=globalThis.__opendeskMountTrustedTimeReview;
    if(typeof factory!=='function')throw Error('Compiled Time Review UI factory is missing');
    // This is a compile-time constant, NOT tool.html or the installed package.
    const template=doc.createElement('template');
    template.innerHTML=html;
    const content=template.content.cloneNode(true);
    const root=content.querySelector('main.review');
    if(!root)throw Error('Compiled Time Review markup is invalid');
    // Irreversible operations and minute-consent changes have their own
    // trusted settings confirmation. Avoid duplicate visible action buttons.
    const clear=root.querySelector('#clear-area');
    if(clear)clear.hidden=true;
    const minute=root.querySelector('#minute-consent')?.closest('.setting-row');
    if(minute)minute.hidden=true;
    container.replaceChildren(content);
    const dispose=factory({root,request});
    if(typeof dispose!=='function')throw Error('Compiled Time Review cleanup is missing');
    return ()=>{
      dispose();
      root.remove();
    };
  }
});
