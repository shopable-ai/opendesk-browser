// Regression-only adapter. These reviews do not grant Chrome/Native authority.
function installMockHost(runMock) {
 const state={kind:'MOCK_HOST_ADAPTER',nativeVerified:false,reviews:[],
  calls:{remove:0,prepareRemoveTree:0,removeTree:0},mutations:[]};
 const approvedTickets=new Map();
 function review(operation,args) {
  if(document.querySelector('[data-testid="mock-host-review"]'))
   throw Error('E_MOCK_HOST_REVIEW_ALREADY_PENDING');
  const row={operation,id:args.id,expected:structuredClone(args.expected),status:'pending'};
  state.reviews.push(row);
  return new Promise((resolve,reject)=>{
   const panel=document.createElement('section');
   panel.dataset.testid='mock-host-review';
   panel.setAttribute('role','alertdialog');
   panel.setAttribute('aria-label','Mock Host 删除审阅');
   panel.style.cssText='position:fixed;inset:20% 12px auto;z-index:9999;padding:16px;background:white;color:black;border:2px solid black';
   const title=document.createElement('p');
   title.textContent='Mock Host：删除 '+args.expected.title;
   panel.append(title);
   for(const [action,label] of [['cancel','取消'],['approve','批准删除']]) {
    const button=document.createElement('button');
    button.type='button';button.dataset.action=action;button.textContent=label;
    button.addEventListener('click',()=>{
     row.status=action==='approve'?'approved':'cancelled';panel.remove();
     if(action==='approve')resolve();
     else reject(Object.assign(Error('Mock Host 已取消删除'),{code:'E_USER_CANCELLED'}));
    },{once:true});
    panel.append(button);
   }
   document.body.append(panel);
   panel.querySelector('button').focus();
  });
 }
 const mockGlobal={__opendeskPreviewScenario:globalThis.__opendeskPreviewScenario,
  parent:globalThis.parent,addEventListener:globalThis.addEventListener.bind(globalThis)};
 runMock(mockGlobal);
 const sdk=mockGlobal.OpenDeskSDK,bookmarks=sdk.browser.bookmarks;
    const guarded={...bookmarks,
     async remove(args) {
      state.calls.remove++;await review('remove',args);
      const result=await bookmarks.remove(args);
      state.mutations.push({operation:'remove',id:args.id});return result;
     },
     async prepareRemoveTree(args) {
      state.calls.prepareRemoveTree++;await review('prepareRemoveTree',args);
      const prepared=await bookmarks.prepareRemoveTree(args);
      approvedTickets.set(prepared.ticket,args.id);return prepared;
     },
     async removeTree(args) {
      state.calls.removeTree++;
      if(approvedTickets.get(args.ticket)!==args.id)
       throw Error('E_MOCK_HOST_UNREVIEWED_TICKET');
      approvedTickets.delete(args.ticket);
      const result=await bookmarks.removeTree(args);
      state.mutations.push({operation:'removeTree',id:args.id});return result;
     }
    };
 Object.defineProperty(globalThis,'OpenDeskSDK',{value:Object.freeze({...sdk,
  browser:Object.freeze({...sdk.browser,bookmarks:Object.freeze(guarded)})})});
 for(const key of ['OpenDeskTool','__opendeskBookmarkMockDiagnostic'])
  Object.defineProperty(globalThis,key,Object.getOwnPropertyDescriptor(mockGlobal,key));
 Object.defineProperty(globalThis,'__BookmarkMockHost',{value:state});
}

export function withMockHostAdapter(mockSource) {
 return '('+installMockHost.toString()+')((globalThis)=>{\n'+mockSource+'\n});';
}
