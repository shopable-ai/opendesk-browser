import assert from 'node:assert/strict';

// The Offscreen document exposes only limited chrome.runtime APIs. Read the
// authoritative context IDs from the real, user-opened Side Panel instead.
// Once the panel is closed, retain only an identity proof for the SAME CDP
// Offscreen target; never infer a new Offscreen from a matching URL alone.
export function createNativeContextReader(evaluate){
  let anchoredOffscreen=null;
  return async function readNativeContexts(c,targets,extensionId){
    const origin='chrome-extension://'+extensionId+'/';
    const offscreenUrl=origin+'cloud-control/runner.html';
    const panelUrl=origin+'sidepanel.html';
    const isDocument=t=>['page','other'].includes(t.type);
    const offscreenTargets=targets.filter(t=>isDocument(t)&&t.url===offscreenUrl);
    const panels=targets.filter(t=>isDocument(t)&&t.url?.startsWith(panelUrl));
    assert(offscreenTargets.length<=1&&panels.length<=1,
      'Ambiguous real Offscreen or Side Panel CDP target');
    if(panels.length===1){
      const {sessionId}=await c.send('Target.attachToTarget',
        {targetId:panels[0].targetId,flatten:true});
      let contexts;
      try{
        await c.send('Runtime.enable',{},sessionId);
        contexts=await evaluate(c,'(async()=>{'+
          'if(typeof chrome.runtime?.getContexts!=="function")'+
            'throw Error("Side Panel runtime.getContexts is unavailable");'+
          'return (await chrome.runtime.getContexts({})).map(x=>({'+
            'type:x.contextType,url:x.documentUrl,documentId:x.documentId}));'+
        '})()',sessionId);
      }finally{
        await c.send('Target.detachFromTarget',{sessionId}).catch(()=>{});
      }
      assert(Array.isArray(contexts),'Side Panel returned no real extension contexts');
      const observed=contexts.filter(x=>x.type==='OFFSCREEN_DOCUMENT'&&
        x.url===offscreenUrl);
      assert(observed.length<=1,'Ambiguous Offscreen runtime context');
      if(observed.length===1){
        if(offscreenTargets.length!==1){
          return {contexts:contexts.filter(x=>x.type!=='OFFSCREEN_DOCUMENT'),
            proof:'side-panel-awaiting-cdp-offscreen-target'};
        }
        assert(typeof observed[0].documentId==='string'&&observed[0].documentId,
          'Real Offscreen context has no documentId');
        anchoredOffscreen={extensionId,targetId:offscreenTargets[0].targetId,
          documentId:observed[0].documentId};
      }
      return {contexts,proof:'real-side-panel-runtime-getContexts'};
    }
    if(!anchoredOffscreen){
      throw Object.assign(Error('Open the real Side Panel to attest Offscreen before native acceptance'),
        {code:'HUMAN_ACTION_REQUIRED'});
    }
    assert(anchoredOffscreen.extensionId===extensionId&&offscreenTargets.length===1&&
      offscreenTargets[0].targetId===anchoredOffscreen.targetId,
      'Original Offscreen target changed after Side Panel closed');
    return {contexts:[{type:'OFFSCREEN_DOCUMENT',url:offscreenUrl,
      documentId:anchoredOffscreen.documentId}],
      proof:'same-cdp-offscreen-target-after-panel-close'};
  };
}
