// Scoped and reversible enhancement for the canonical demo-form test region.
// Does not inspect site framework internals or change forms/business data.
export function createDemoEnhancer(ui,{regionSelector='#lab-text',targetSelector='#sample-text'}={}){
  const doc=ui.content.ownerDocument;
  const regions=doc.querySelectorAll(regionSelector),region=regions.length===1?regions[0]:null;
  let enabled=false,target=null,oldOutline='',oldPriority='',applied=null,marker=null;
  function find(){
    if(!region?.isConnected)return {node:null,message:regions.length>1?'多个测试区域，拒绝操作':'测试区域不存在'};
    const rows=region.querySelectorAll(targetSelector);
    if(rows.length!==1)return {node:null,message:rows.length?'多个目标，拒绝操作':'目标尚未出现'};
    return {node:rows[0],message:null};
  }
  function undo(){
    marker?.remove();marker=null;
    if(target?.style?.getPropertyValue('outline')===applied){
      if(oldOutline)target.style.setProperty('outline',oldOutline,oldPriority);
      else target.style.removeProperty('outline');
    }
    target=null;oldOutline='';oldPriority='';applied=null;
  }
  function mark(node){
    if(!node?.isConnected)return false;
    target=node;oldOutline=node.style.getPropertyValue('outline');
    oldPriority=node.style.getPropertyPriority('outline');
    node.style.setProperty('outline','3px solid #e09b24');
    applied=node.style.getPropertyValue('outline'); // Browser normalizes CSS serialization.
    marker=doc.createElement('span');marker.textContent=' · OpenDesk 已标记';
    marker.setAttribute('data-opendesk-example-marker','1');
    marker.style.cssText='margin-inline-start:8px;font-size:12px;color:#946006';
    node.insertAdjacentElement('afterend',marker);return true;
  }
  function toggle(){
    if(enabled){enabled=false;undo();return {active:false,message:'已撤销网页改动'};}
    const hit=find();if(!hit.node)return {active:false,message:hit.message};
    enabled=mark(hit.node);
    return {active:enabled,message:enabled?'已高亮并添加标记':'目标已失效'};
  }
  function sync(){
    if(!enabled)return;
    const hit=find();
    if(!hit.node){undo();return;} // Preserve desired highlight across transient target repaint.
    if(hit.node!==target||!marker?.isConnected){undo();enabled=mark(hit.node);}
  }
  if(region?.isConnected)ui.observe(region,sync,{childList:true,subtree:true});
  ui.onDispose(()=>{enabled=false;undo();});
  return Object.freeze({toggle,get active(){return enabled;}});
}
