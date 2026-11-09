import {createPageUI} from '@opendesk/ui';
import {createDynamicReadingToc} from './engine.js';

export default async function main({assets}={}){
  if(window.top!==window)return {state:'skipped'};
  const owner=createPageUI({id:'app.reading-toc',assets,baseStyles:false});
  // A lifecycle anchor only. The shared TOC view owns the actual overlay.
  owner.host.style.setProperty('display','none','important');
  try{
    const engine=createDynamicReadingToc({bridge:globalThis.OpenDeskAppPage,owner});
    return await engine.ready;
  }catch(error){owner.destroy();throw error;}
}
