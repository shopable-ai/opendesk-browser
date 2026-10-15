// Full Bookmarks Driver for the existing trusted installed-tool SDK Host.
// Native Chrome objects, pagination state and delete tickets never enter the sandbox.
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const REF=/^[A-Za-z0-9_-]{16,160}$/,ID=/^.{1,128}$/;
const MAX_NODES=20000,MAX_TREE_BYTES=8000000,PAGE_BYTES=10500;
const readBytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const identity=c=>{
  if(!/^[a-z][a-z0-9-]{1,39}$/.test(c?.toolId)||!/^[a-f0-9]{64}$/.test(c?.packageHash)||
     typeof c?.toolVersion!=='string'||!c.toolVersion||typeof c?.installEpoch!=='string'||!c.installEpoch)
    throw fail('E_OWNER','Verified tool/package/install identity required');
  return JSON.stringify([c.toolId,c.toolVersion,c.packageHash,c.installEpoch]);
};
const project=(node,parent=null,index=null)=>{
  if(!node||typeof node.id!=='string'||!ID.test(node.id)||
     typeof node.title!=='string'||node.title.length>256)throw fail('E_CHROME','Invalid bookmark node');
  const row={id:node.id,parentId:node.parentId??parent,index:node.index??index,title:node.title};
  if(row.parentId!==null&&(typeof row.parentId!=='string'||!ID.test(row.parentId))||
     row.index!==null&&(!Number.isSafeInteger(row.index)||row.index<0))
    throw fail('E_CHROME','Invalid native bookmark relationship');
  for(const k of ['url','unmodifiable','folderType'])
    if(node[k]!==undefined){
      if(typeof node[k]!=='string'||node[k].length>(k==='url'?4096:80))throw fail('E_LIMIT','Bookmark metadata exceeds bound');
      row[k]=node[k];
    }
  for(const k of ['dateAdded','dateGroupModified'])if(Number.isFinite(node[k]))row[k]=node[k];
  if(typeof node.syncing==='boolean')row.syncing=node.syncing;
  return row;
};
const precondition=n=>({id:n.id,parentId:n.parentId??null,index:n.index??null,title:n.title??'',
  url:n.url??null,unmodifiable:n.unmodifiable??null,folderType:n.folderType??null});
const sig=n=>JSON.stringify(precondition(n));
const flatten=roots=>{
  if(!Array.isArray(roots)||!roots.length)throw fail('E_CHROME','Chrome bookmarks root missing');
  const nodes=[],seen=new Set(),stack=roots.map((node,i)=>[node,null,null,0]).reverse();
  while(stack.length){
    const [node,parent,index,depth]=stack.pop();
    if(depth>100||nodes.length>=MAX_NODES||seen.has(node?.id))throw fail('E_LIMIT','Bookmark tree too large/deep/duplicated');
    const row=project(node,parent,index);nodes.push(row);seen.add(row.id);
    if(Array.isArray(node.children))for(let i=node.children.length-1;i>=0;i--)
      stack.push([node.children[i],row.id,i,depth+1]);
    if(nodes.length%256===0&&readBytes(nodes)>MAX_TREE_BYTES)throw fail('E_LIMIT','Snapshot exceeds memory budget');
  }
  if(readBytes(nodes)>MAX_TREE_BYTES)throw fail('E_LIMIT','Snapshot exceeds memory budget');
  return nodes;
};
const managed=n=>n?.unmodifiable==='managed'||n?.folderType==='managed';
const descendants=(all,id)=>{
  const byId=new Map(all.map(n=>[n.id,n]));const found=[];
  for(const item of all){
    let n=item,depth=0;
    while(n&&n.id!==id&&depth++<101)n=byId.get(n.parentId);
    if(n?.id===id)found.push(item);
  }
  return found;
};
const digest=async nodes=>{
  const bytes=new TextEncoder().encode(nodes.map(sig).join('\n'));
  const hashed=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hashed)].map(x=>x.toString(16).padStart(2,'0')).join('');
};
export function createBrowserFullBookmarksHost({api=globalThis.chrome,authorize,verifySourcePage,
  clock=Date,makeRef=()=>crypto.randomUUID()}={}){
  if(typeof authorize!=='function')throw fail('E_CONTEXT','Full Bookmarks trusted authorization required');
  const snapshots=new Map(),tickets=new Map(),sessions=new Map();
  let generation=0,revision=0;
  const live=(epoch,reviewed)=>{
    if(epoch!==generation)throw fail('E_GRANT_REVOKED','Bookmark authority changed during preflight');
    if(reviewed!==revision)throw fail('E_BOOKMARK_STALE','Bookmark change observed during preflight; review again');
  };
  const auth=(operation,context)=>authorize({operation:'browser.bookmarks.'+operation,context,origin:null});
  const native=name=>{
    if(typeof api?.bookmarks?.[name]!=='function')throw fail('E_CHROME_UNSUPPORTED','Missing chrome.bookmarks.'+name);
    return api.bookmarks[name].bind(api.bookmarks);
  };
  const read=async(name,...args)=>{
    try{return await native(name)(...args)}
    catch(e){if(e?.code==='E_CHROME_UNSUPPORTED')throw e;throw fail('E_CHROME','Chrome bookmarks read failed')}
  };
  const write=async(name,...args)=>{
    try{return await native(name)(...args)}
    catch{throw fail('E_OUTCOME_UNKNOWN','Bookmark write outcome unknown; never replay automatically')}
  };
  const getNode=async id=>{
    let found;try{found=await read('get',id)}catch{throw fail('E_BOOKMARK_STALE','Bookmark is missing or not accessible')}
    if(!Array.isArray(found)||found.length!==1||found[0]?.id!==id)throw fail('E_BOOKMARK_STALE');
    return project(found[0]);
  };
  const root=async()=>{
    const trees=await read('getTree');
    if(!Array.isArray(trees)||trees.length!==1||!ID.test(trees[0]?.id))throw fail('E_CHROME','Invalid bookmark root');
    return trees[0].id;
  };
  const editable=async(id,expected)=>{
    const node=await getNode(id),rootId=await root();
    if(node.parentId===null||node.parentId===rootId||managed(node))
      throw fail('E_BOOKMARK_PROTECTED','Root or special/managed folder cannot be modified');
    if(expected&&sig(node)!==sig(expected))
      throw fail('E_BOOKMARK_STALE','Bookmark no longer matches its reviewed version');
    let current=node,visited=new Set();
    while(current.parentId&&current.parentId!==rootId){
      if(visited.has(current.id)||visited.size>=100)throw fail('E_BOOKMARK_PROTECTED','Unsafe bookmark ancestry');
      visited.add(current.id);current=await getNode(current.parentId);
      if(managed(current))throw fail('E_BOOKMARK_PROTECTED','Managed ancestry is immutable');
    }
    return node;
  };
  const parentFolder=async id=>{
    const p=await getNode(id);
    if(Object.hasOwn(p,'url')||p.parentId===null||managed(p))throw fail('E_BOOKMARK_PROTECTED','Invalid parent folder');
    let current=p;const seen=new Set();
    while(current.parentId!==null){
      if(seen.has(current.id)||seen.size>=100)
        throw fail('E_BOOKMARK_PROTECTED','Unsafe parent ancestry');
      seen.add(current.id);current=await getNode(current.parentId);
      if(managed(current))throw fail('E_BOOKMARK_PROTECTED','Managed destination ancestry is immutable');
    }
    return p;
  };
  const subtree=async id=>{
    const nodes=flatten(await read('getSubTree',id));
    if(nodes[0]?.id!==id)throw fail('E_BOOKMARK_STALE','Bookmark subtree changed');
    return nodes;
  };
  const prune=map=>{for(const [key,row] of map)if(row.expiresAt<=clock.now()||row.generation!==generation)map.delete(key)};
  const newRef=(map)=>{
    const ref=makeRef();
    if(typeof ref!=='string'||!REF.test(ref)||map.has(ref))throw fail('E_CONTEXT','Invalid unique bookmark reference');
    return ref;
  };
  const access=(ref,context,kind)=>{
    const data=snapshots.get(ref);
    if(!data||data.owner!==identity(context)||data.generation!==generation||
      data.expiresAt<=clock.now()||data.kind!==kind)throw fail('E_SNAPSHOT_EXPIRED','Snapshot expired; resync');
    return data;
  };
  const page=(ref,data,offset,limit=80)=>{
    const nodes=[];
    for(let i=offset;i<data.nodes.length&&nodes.length<Math.min(limit,100);i++){
      const candidate={snapshotRef:ref,nodes:[...nodes,data.nodes[i]],
        ...(i+1<data.nodes.length?{nextCursor:ref+':'+(i+1)}:{})};
      if(readBytes(candidate)>PAGE_BYTES){
        if(!nodes.length)throw fail('E_LIMIT','Bookmark cannot fit a bounded response page');
        break;
      }
      nodes.push(data.nodes[i]);
    }
    const end=offset+nodes.length;
    return {snapshotRef:ref,nodes,...(end<data.nodes.length?{nextCursor:ref+':'+end}:{})};
  };
  const resume=(input,ctx,kind)=>{
    const m=/^([A-Za-z0-9_-]{16,160}):([1-9]\d{0,7})$/.exec(input.cursor||'');
    if(!m)throw fail('E_SNAPSHOT_EXPIRED','Invalid snapshot cursor');
    const data=access(m[1],ctx,kind),offset=Number(m[2]);
    if(offset>=data.nodes.length)throw fail('E_SNAPSHOT_EXPIRED','Cursor out of range');
    return page(m[1],data,offset,input.limit);
  };
  const snapshot=(nodes,ctx,kind,limit)=>{
    prune(snapshots);
    const owner=identity(ctx);
    // Routine refreshes must not exhaust the finite pool for two minutes.
    // Recycle only this installation's oldest snapshot; never evict another
    // owner. A consumer still paging that snapshot gets E_SNAPSHOT_EXPIRED.
    if(snapshots.size>=8){
      const oldest=[...snapshots].find(([,row])=>row.owner===owner);
      if(oldest)snapshots.delete(oldest[0]);
    }
    if(snapshots.size>=8)throw fail('E_LIMIT','Too many bookmark snapshots');
    const ref=newRef(snapshots);
    const data={owner,nodes,kind,generation,expiresAt:clock.now()+120000};
    snapshots.set(ref,data);return page(ref,data,0,limit);
  };
  async function getTree(args,ctx){
    await auth('getTree',ctx);
    if(args.cursor)return resume(args,ctx,'tree');
    const items=flatten(await read('getTree'));
    if(items.length!==0&&items[0].parentId!==null)throw fail('E_CHROME','Bookmark root missing');
    return snapshot(items,ctx,'tree',args.limit);
  }
  async function get(args,ctx){await auth('get',ctx);return [await getNode(args.id)];}
  async function search(args,ctx){
    await auth('search',ctx);
    if(args.cursor)return resume(args,ctx,'search');
    if(!args.query||typeof args.query==='object'&&!Object.values(args.query).some(Boolean))
      throw fail('E_SCHEMA','A nonempty bookmark query is required');
    const raw=await read('search',args.query);
    if(!Array.isArray(raw)||raw.length>MAX_NODES)throw fail('E_LIMIT','Search is too large');
    const nodes=raw.map(row=>project(row));
    if(readBytes(nodes)>MAX_TREE_BYTES)throw fail('E_LIMIT','Search exceeded safe memory');
    return snapshot(nodes,ctx,'search',args.limit);
  }
  async function create(args,ctx){
    const epoch=generation,reviewed=revision;
    await auth('create',ctx);
    if(args.sourcePage){
      if(!args.url||args.url!==args.sourcePage.url)throw fail('E_DOCUMENT_BINDING_REQUIRED','Source URL mismatch');
      if(typeof verifySourcePage!=='function')throw fail('E_DOCUMENT_BINDING_REQUIRED','Trusted document check unavailable');
      await verifySourcePage(args.sourcePage,ctx);
    }
    if(args.parentId)await parentFolder(args.parentId);
    if(!args.title.trim())throw fail('E_SCHEMA','Bookmark title is empty');
    // Prior awaited parent checks could have allowed another document to load.
    await auth('create',ctx);
    if(args.sourcePage)await verifySourcePage(args.sourcePage,ctx);
    live(epoch,reviewed);
    const {sourcePage,...details}=args,result=await write('create',details);
    if(epoch!==generation)throw fail('E_OUTCOME_UNKNOWN');
    return project(result);
  }
  async function update(args,ctx){
    const epoch=generation,reviewed=revision;
    await auth('update',ctx);
    const node=await editable(args.id,args.expected);
    if(!Object.keys(args.changes).length||!Object.hasOwn(node,'url')&&args.changes.url!==undefined)
      throw fail('E_SCHEMA','Invalid folder/bookmark changes');
    await auth('update',ctx);
    live(epoch,reviewed);
    const result=await write('update',args.id,args.changes);
    if(epoch!==generation)throw fail('E_OUTCOME_UNKNOWN');
    return project(result);
  }
  async function move(args,ctx){
    const epoch=generation,reviewed=revision;
    await auth('move',ctx);
    await editable(args.id,args.expected);await parentFolder(args.destination.parentId);
    let ancestor=await getNode(args.destination.parentId),seen=new Set();
    while(ancestor.parentId!==null){
      if(ancestor.id===args.id||seen.has(ancestor.id))throw fail('E_BOOKMARK_PROTECTED','Cycle move refused');
      seen.add(ancestor.id);ancestor=await getNode(ancestor.parentId);
    }
    await editable(args.id,args.expected);
    await auth('move',ctx);
    live(epoch,reviewed);
    const result=await write('move',args.id,args.destination);
    if(epoch!==generation)throw fail('E_OUTCOME_UNKNOWN');
    return project(result);
  }
  async function remove(args,ctx){
    const epoch=generation,reviewed=revision;
    await auth('remove',ctx);
    await editable(args.id,args.expected);
    if((await subtree(args.id)).length!==1)throw fail('E_BOOKMARK_NOT_EMPTY','Nonempty folder requires removeTree');
    await auth('remove',ctx);
    live(epoch,reviewed);await write('remove',args.id);
    if(epoch!==generation)throw fail('E_OUTCOME_UNKNOWN');
    return {removed:true};
  }
  async function prepareRemoveTree(args,ctx){
    const epoch=generation,reviewed=revision;
    await auth('prepareRemoveTree',ctx);
    const snapshotData=access(args.snapshotRef,ctx,'tree');
    const original=descendants(snapshotData.nodes,args.id);
    if(original.length!==args.descendantCount+1||original.length<2||
      sig(original[0])!==sig(args.expected))throw fail('E_BOOKMARK_STALE','Reviewed tree does not match');
    await editable(args.id,args.expected);
    const current=await subtree(args.id);
    if(current.length!==original.length||current.some(managed)||
      current.map(sig).join('\n')!==original.map(sig).join('\n'))
      throw fail('E_BOOKMARK_STALE','Subtree changed since reviewed snapshot');
    await auth('prepareRemoveTree',ctx);
    const signature=await digest(current);live(epoch,reviewed);
    prune(tickets);
    if(tickets.size>=16)throw fail('E_LIMIT','Too many pending folder deletes');
    const ticket=newRef(tickets),expiresAt=clock.now()+15000;
    tickets.set(ticket,{owner:identity(ctx),generation:epoch,expiresAt,id:args.id,
      expected:args.expected,descendantCount:args.descendantCount,digest:signature});
    return {ticket,targetId:args.id,descendantCount:args.descendantCount,expiresAt};
  }
  async function removeTree(args,ctx){
    const epoch=generation,reviewed=revision;
    await auth('removeTree',ctx);
    // Spend one-use ticket before all awaits, including validation and Chrome.
    const ticket=tickets.get(args.ticket);tickets.delete(args.ticket);
    if(!ticket||ticket.owner!==identity(ctx)||ticket.generation!==generation||
      ticket.expiresAt<=clock.now()||ticket.id!==args.id)
      throw fail('E_BOOKMARK_CONFIRM_EXPIRED','Deletion ticket invalid or already used');
    await editable(args.id,ticket.expected);
    const current=await subtree(args.id);
    if(current.length!==ticket.descendantCount+1||current.some(managed)||
       await digest(current)!==ticket.digest)throw fail('E_BOOKMARK_STALE','Folder changed; delete cancelled');
    await auth('removeTree',ctx);
    live(epoch,reviewed);
    if(ticket.expiresAt<=clock.now())throw fail('E_BOOKMARK_CONFIRM_EXPIRED','Deletion approval expired during preflight');
    await write('removeTree',args.id);
    if(epoch!==generation)throw fail('E_OUTCOME_UNKNOWN');
    return {removed:true};
  }
  function publish(kind,id,details){
    // Fence native events observed during awaited preflight, including the
    // final permission check. Chrome still provides no atomic read/write CAS.
    revision++;
    const compact=details&&Object.fromEntries(Object.entries(details).filter(([,value])=>value!==undefined));
    const item={kind,timestamp:clock.now(),...(typeof id==='string'&&ID.test(id)?{id}:{}),
      ...(compact&&Object.keys(compact).length?{details:compact}:{})};
    if(readBytes(item)>3000)item.details={truncated:true};
    for(const row of sessions.values()){
      if(row.generation!==generation||row.expiresAt<=clock.now())continue;
      row.events.push({...item,seq:++row.seq});
      if(row.events.length>row.maxEvents){row.events.shift();row.droppedCount++;}
    }
  }
  // Register MV3 Chrome listeners synchronously. These are not user callbacks.
  const on=(name,cb)=>api?.bookmarks?.[name]?.addListener?.(cb);
  on('onCreated',(id,node)=>publish('created',id,{node:project(node)}));
  on('onRemoved',(id,info)=>publish('removed',id,{parentId:info?.parentId,index:info?.index}));
  on('onChanged',(id,info)=>publish('changed',id,{title:info?.title,url:info?.url}));
  on('onMoved',(id,info)=>publish('moved',id,{parentId:info?.parentId,index:info?.index,
    oldParentId:info?.oldParentId,oldIndex:info?.oldIndex}));
  on('onChildrenReordered',(id,info)=>publish('childrenReordered',id,{
    childIds:Array.isArray(info?.childIds)?info.childIds.slice(0,200):[]}));
  on('onImportBegan',()=>publish('importBegan'));
  on('onImportEnded',()=>publish('importEnded'));
  const observe=Object.freeze({
    async start(args,ctx){
      await auth('observe.start',ctx);prune(sessions);
      if(typeof api?.bookmarks?.onCreated?.addListener!=='function')
        throw fail('E_CHROME_UNSUPPORTED','Chrome Bookmarks events unavailable');
      if(sessions.size>=8)throw fail('E_LIMIT','Too many bookmark event sessions');
      const sessionRef=newRef(sessions),expiresAt=clock.now()+Math.min(args.durationMs??30000,30000);
      sessions.set(sessionRef,{owner:identity(ctx),generation,expiresAt,events:[],seq:0,
        droppedCount:0,maxEvents:Math.min(args.maxEvents??100,100)});
      return {sessionRef,cursor:'0',expiresAt};
    },
    async read(args,ctx){
      await auth('observe.read',ctx);
      const session=sessions.get(args.sessionRef);
      if(!session||session.owner!==identity(ctx)||session.generation!==generation||
        session.expiresAt<=clock.now())throw fail('E_SESSION_EXPIRED','Event gap; reload full tree');
      const cursor=Number(args.cursor??'0'),limit=Math.min(args.limit??50,50);
      if(!Number.isSafeInteger(cursor)||cursor<0||cursor>session.seq)throw fail('E_EVENT_CURSOR');
      const earliest=session.events[0]?.seq??session.seq+1,gapCount=Math.max(0,earliest-cursor-1);
      const events=[];
      for(const e of session.events){
        if(e.seq<=cursor||events.length>=limit)continue;
        if(readBytes({events:[...events,e],nextCursor:String(e.seq),expiresAt:session.expiresAt,
          gapCount,droppedCount:session.droppedCount})>PAGE_BYTES)break;
        events.push(e);
      }
      return {events,nextCursor:String(events.at(-1)?.seq??cursor),
        expiresAt:session.expiresAt,gapCount,droppedCount:session.droppedCount};
    },
    async stop(args,ctx){
      await auth('observe.stop',ctx);
      const row=sessions.get(args.sessionRef);
      if(!row||row.owner!==identity(ctx)||row.generation!==generation)
        throw fail('E_SESSION_EXPIRED');
      sessions.delete(args.sessionRef);return {stopped:true};
    }
  });
  return Object.freeze({getTree,get,search,create,update,move,remove,
    prepareRemoveTree,removeTree,observe,
    revokeAll:()=>{generation++;snapshots.clear();tickets.clear();sessions.clear()}});
}
