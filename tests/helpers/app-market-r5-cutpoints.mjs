// Exact selectors for existing product calls. They do not alter product code,
// storage, return values or API implementations. Ambiguity is NOT_OBSERVED.
import {parse} from 'acorn';
export function discoverMarketCutPoints(source,{required=['A1','A2','B','C'],registryStoreKey}={}){
  const bad=message=>{const error=new Error('Market cut not observed: '+message);error.code='E_NATIVE_NOT_OBSERVED';throw error;};
  const need=(value,label)=>value||bad(label);
  const one=(rows,label)=>{need(rows.length===1,label+' (found '+rows.length+')');return rows[0];};
  const isFn=node=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node?.type);
  const unchain=node=>node?.type==='ChainExpression'?node.expression:node;
  const name=node=>node?.type==='Identifier'?node.name:node?.type==='Literal'?node.value:null;
  const literal=(node,value)=>node?.type==='Literal'&&node.value===value;
  const key=(node,value)=>node?.type==='Property'&&!node.computed&&name(node.key)===value;
  const truth=node=>literal(node,true)||(node?.type==='UnaryExpression'&&node.operator==='!'&&literal(node.argument,0));
  const path=input=>{const node=unchain(input);if(node?.type==='Identifier')return node.name;
    if(node?.type!=='MemberExpression'||node.computed||node.property.type!=='Identifier')return null;
    const base=path(node.object);return base&&base+'.'+node.property.name;};
  const entries=[],index=new Map();
  function walk(node,ancestors=[],owner=null){
    if(!node?.type)return;const entry={node,ancestors,owner};entries.push(entry);index.set(node,entry);
    const childOwner=isFn(node)?node:owner;
    for(const value of Object.values(node)){
      if(Array.isArray(value))for(const child of value)walk(child,[...ancestors,node],childOwner);
      else if(value?.type)walk(value,[...ancestors,node],childOwner);
    }
  }
  walk(parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}));
  const own=(fn,predicate)=>entries.filter(entry=>entry.owner===fn&&predicate(entry.node)).map(entry=>entry.node);
  const calls=(fn,predicate)=>own(fn,node=>node.type==='CallExpression'&&predicate(node));
  const awaited=node=>need(index.get(node).ancestors.at(-1)?.type==='AwaitExpression','direct awaited call: '+source.slice(node.start,node.end));
  const ownerOfMarker=value=>one(entries.filter(entry=>literal(entry.node,value)),'unique marker '+value);
  const point=(node,bindings)=>{
    const nested=entries.filter(({node:child})=>child!==node&&child.start>=node.start&&child.end<=node.end&&
      ['CallExpression','NewExpression','TaggedTemplateExpression','ImportExpression'].includes(child.type));
    need(nested.length===0,'cut call must contain no nested invocation');
    return {range:[node.start,node.end],text:source.slice(node.start,node.end),nestedInvocations:0,
    location:{lineNumber:node.loc.start.line-1,columnNumber:node.loc.start.column},
    endLocation:{lineNumber:node.loc.end.line-1,columnNumber:node.loc.end.column},breakpointType:'call',...bindings};};
  const wanted=new Set(required),result={};
  need(wanted.size===required.length&&required.length>0&&required.every(id=>['A1','A2','B','C'].includes(id)),'explicit unique required cuts');
  if(wanted.has('A1')||wanted.has('A2')){
    const marker=ownerOfMarker('Missing created tab identity'),fn=need(marker.owner,'handoff function');
    const query=one(calls(fn,node=>path(node.callee)?.endsWith('.tabs.query')),'handoff tabs.query');
    const apiNode=unchain(query.callee)?.object?.object;
    need(apiNode?.type==='Identifier','actual handoff API binding');const api=apiNode.name;
    need(query.arguments.length===1&&query.arguments[0].type==='ObjectExpression'&&query.arguments[0].properties.length===0,'query all real tabs');
    const create=one(calls(fn,node=>path(node.callee)===api+'.tabs.create'),'handoff tabs.create');
    awaited(query);awaited(create);
    const guard=one(marker.ancestors.filter(node=>node.type==='IfStatement'&&index.get(node).owner===fn),'created identity guard');
    need(marker.node.start>=guard.consequent.start&&marker.node.end<=guard.consequent.end,'throw belongs to guard consequent');
    const checked=one(calls(fn,node=>node.start>=guard.test.start&&node.end<=guard.test.end&&path(node.callee)==='Number.isSafeInteger'),'created tab identity call');
    const tabMember=unchain(checked.arguments[0]);
    need(checked.arguments.length===1&&tabMember?.type==='MemberExpression'&&!tabMember.computed&&name(tabMember.property)==='id'&&tabMember.object.type==='Identifier','created tab binding');
    const tab=tabMember.object.name;
    const opened=one(own(fn,node=>node.type==='AssignmentExpression'&&node.operator==='='&&literal(node.right,'opened')&&node.left.type==='MemberExpression'&&!node.left.computed&&name(node.left.property)==='phase'),'opened phase assignment');
    need(opened.left.object.type==='Identifier','durable intent binding');const intent=opened.left.object.name;
    const tabId=one(own(fn,node=>node.type==='AssignmentExpression'&&node.operator==='='&&path(node.left)===intent+'.tabId'&&path(node.right)===tab+'.id'),'persist actual tab identity');
    const persistFn=need(ownerOfMarker('Readback mismatch').owner,'handoff readback writer');
    need(persistFn.type==='FunctionDeclaration'&&persistFn.async&&persistFn.id?.name,'named durable handoff writer');
    const saves=calls(fn,node=>node.callee.type==='Identifier'&&node.callee.name===persistFn.id.name).sort((a,b)=>a.start-b.start);
    need(saves.length===2&&saves.every(node=>node.arguments.length===1&&node.arguments[0].type==='Identifier'),'two exact handoff saves');
    saves.forEach(awaited);need(saves[0].arguments[0].name===saves[1].arguments[0].name,'same durable handoff state');
    need(saves[0].end<query.start&&query.end<create.start&&create.end<checked.start&&checked.end<tabId.start&&tabId.end<=opened.start&&opened.end<saves[1].start,'prepared -> query -> create -> checked -> opened -> save order');
    need(fn.params.length===2&&fn.params.every(node=>node.type==='Identifier'),'actual handoff message/sender parameters');
    need(create.arguments.length===1&&create.arguments[0].type==='ObjectExpression','fixed review create options');
    const url=one(create.arguments[0].properties.filter(node=>key(node,'url')),'review URL property').value;
    need(url.type==='Identifier','actual internal review URL binding');
    const bindings={apiExpression:api,senderExpression:fn.params[1].name,intentExpression:intent,
      stateExpression:saves[0].arguments[0].name,tabExpression:tab,reviewURLExpression:url.name};
    if(wanted.has('A1')){const {tabExpression,...beforeCreate}=bindings;result.A1=point(query,beforeCreate);}
    if(wanted.has('A2'))result.A2=point(checked,bindings);
  }
  if(wanted.has('B')){
    const scopedCall=scope=>one(entries.filter(entry=>entry.node.type==='CallExpression'&&literal(entry.node.arguments.at(-1),scope)),scope+' writer');
    const registry=scopedCall('工具安装记录'),journal=scopedCall('市场事务记录'),fn=registry.owner,writer=journal.owner;
    need(fn&&writer&&fn!==writer&&fn.async&&writer.async,'installer lock callback and journal closure');
    const declaration=one(entries.filter(entry=>entry.node.type==='VariableDeclarator'&&entry.node.init===writer),'bound installer journal closure');
    need(declaration.owner===fn&&declaration.node.id.type==='Identifier','journal is local to the same installer');const writeOp=declaration.node.id.name;
    const phaseCall=phase=>one(calls(fn,node=>node.callee.type==='Identifier'&&node.callee.name===writeOp&&node.arguments.length===1&&literal(node.arguments[0],phase)),'installer writeOp '+phase);
    const reviewed=phaseCall('reviewed'),committing=phaseCall('committing');
    [reviewed,committing,registry.node,journal.node].forEach(awaited);
    need(registry.node.arguments.length===5&&journal.node.arguments.length===5&&registry.node.callee.type==='Identifier'&&journal.node.callee.type==='Identifier'&&registry.node.callee.name===journal.node.callee.name,'same verified storage writer');
    need(registry.node.arguments.slice(0,2).every(node=>node.type==='Identifier')&&journal.node.arguments.slice(0,2).every(node=>node.type==='Identifier'),'actual API and store bindings');
    need(registry.node.arguments[0].name===journal.node.arguments[0].name&&registry.node.arguments[1].name!==journal.node.arguments[1].name,'separate registry and journal stores');
    const commitProperties=index.get(fn).ancestors.filter(isFn).flatMap(parent=>parent.params.flatMap(param=>param.type==='ObjectPattern'?param.properties.filter(node=>key(node,'commitIntent')):[]));
    const commitProperty=one(commitProperties,'installer commitIntent parameter');
    const commitBinding=commitProperty.value.type==='AssignmentPattern'?commitProperty.value.left:commitProperty.value;
    need(commitBinding.type==='Identifier','actual consume callback binding');
    const consume=one(calls(fn,node=>node.callee.type==='Identifier'&&node.callee.name===commitBinding.name&&node.arguments.length===0),'awaited intent consumption');
    awaited(consume);need(consume.end<reviewed.start&&reviewed.end<committing.start&&committing.end<registry.node.start,'consume -> reviewed -> committing -> registry order');
    const operation=one(own(writer,node=>node.type==='Property'&&node.computed&&path(node.key)?.endsWith('.operationId')),'journal operation identity').key;
    const toolId=one(own(writer,node=>key(node,'toolId')),'journal tool identity').value;
    need(unchain(operation).object.type==='Identifier'&&path(toolId)?.endsWith('.id'),'bound operation/tool identity');
    result.B=point(reviewed,{apiExpression:registry.node.arguments[0].name,registryKeyExpression:registry.node.arguments[1].name,
      journalKeyExpression:journal.node.arguments[1].name,writeOpExpression:writeOp,storageWriterExpression:registry.node.callee.name,
      operationIdExpression:source.slice(operation.start,operation.end),toolIdExpression:source.slice(toolId.start,toolId.end)});
  }
  if(wanted.has('C')){
    const returned=one(entries.filter(({node})=>{
      if(node.type!=='ReturnStatement'||node.argument?.type!=='ObjectExpression')return false;
      const properties=node.argument.properties,confirmed=properties.filter(node=>key(node,'confirmed')),ack=properties.filter(node=>key(node,'acknowledgementLost'));
      return properties.length===2&&confirmed.length===1&&truth(confirmed[0].value)&&ack.length===1&&ack[0].value.type==='CallExpression'&&path(ack[0].value.callee)==='Boolean'&&ack[0].value.arguments.length===1&&ack[0].value.arguments[0].type==='Identifier';
    }),'verified storage result'),fn=returned.owner;
    need(fn?.async&&fn.params.length===5&&fn.params.slice(0,4).every(node=>node.type==='Identifier'),'actual verified writer parameters');
    const scope=fn.params[4];need(scope.type==='AssignmentPattern'&&scope.left.type==='Identifier'&&literal(scope.right,'本地存储'),'actual scope parameter');
    const [api,store,next,previous]=fn.params.slice(0,4).map(node=>node.name),scopeName=scope.left.name;
    need(new Set([api,store,next,previous,scopeName]).size===5,'distinct writer bindings');
    const set=one(calls(fn,node=>path(node.callee)===api+'.storage.local.set'),'verified local set'),get=one(calls(fn,node=>path(node.callee)===api+'.storage.local.get'),'verified local readback');
    awaited(set);awaited(get);
    need(set.arguments.length===1&&set.arguments[0].type==='ObjectExpression'&&set.arguments[0].properties.length===1,'single exact local write');
    const entry=set.arguments[0].properties[0];
    need(entry.type==='Property'&&entry.computed&&entry.key.type==='Identifier'&&entry.key.name===store&&entry.value.type==='Identifier'&&entry.value.name===next,'write uses actual key/next parameters');
    need(get.arguments.length===1&&get.arguments[0].type==='Identifier'&&get.arguments[0].name===store,'readback uses same key parameter');
    need(set.end<get.start&&get.end<returned.node.start,'set completion before readback before confirmed result');
    const ack=returned.node.argument.properties.find(node=>key(node,'acknowledgementLost')).value.arguments[0];
    one(own(fn,node=>node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.id.name===ack.name&&literal(node.init,null)),'local write failure binding');
    if(result.B)need(fn.id?.name===result.B.storageWriterExpression,'B and C resolve to the same helper');
    result.C=point(get,{apiExpression:api,keyExpression:store,scopeExpression:scopeName,nextExpression:next,
      previousExpression:previous,failureExpression:ack.name,helperExpression:fn.id?.name||null});
    result.C.submission=point(set,{keyExpression:store,scopeExpression:scopeName,nextExpression:next,previousExpression:previous,failureExpression:ack.name});
    if(registryStoreKey!==undefined){need(typeof registryStoreKey==='string'&&registryStoreKey.length>0,'literal registry storage key');
      result.C.condition=store+'==='+JSON.stringify(registryStoreKey)+' && '+scopeName+'==="工具安装记录"';result.C.submission.condition=result.C.condition;}
  }
  return result;
}

// V8 reports a call position inside a member expression; it need not be the
// AST node's first character. Accept only the browser's sole explicit call in
// this exact invocation (proved above to contain no nested invocations).
export function marketCallLocation(point,locations,scriptId){
  const order=(a,b)=>a.lineNumber-b.lineNumber||a.columnNumber-b.columnNumber;
  const valid=row=>row&&Number.isInteger(row.lineNumber)&&row.lineNumber>=0&&Number.isInteger(row.columnNumber)&&row.columnNumber>=0;
  const bad=()=>{
    const error=new Error('Unique browser call position inside the exact non-nested market invocation unavailable');
    error.code='E_NATIVE_NOT_OBSERVED';throw error;
  };
  if(point.nestedInvocations!==0||point.breakpointType!=='call'||!valid(point.location)||!valid(point.endLocation)||
    order(point.location,point.endLocation)>=0||!Array.isArray(locations))bad();
  if(locations.some(row=>row.scriptId!==scriptId||!valid(row)||order(row,point.location)<0||order(row,point.endLocation)>=0))bad();
  const calls=locations.filter(row=>row.type==='call');if(calls.length!==1)bad();
  const {lineNumber,columnNumber}=calls[0];return {scriptId,lineNumber,columnNumber};
}
