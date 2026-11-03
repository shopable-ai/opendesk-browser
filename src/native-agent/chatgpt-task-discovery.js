// Eligibility only. This observer never grants permission, parses a task, or
// runs code. The existing Host and durable trigger ledger own those decisions.
const describe=node=>{
  // Distinct local messages can share a fallback-turn-0 key. Use the real
  // message IDs across remounts; a fallback key proves no shared identity.
  const ids=node.getAttribute?.('data-chatgpt-search-message-ids');
  const key=node.getAttribute?.('data-chatgpt-search-unit-key')||node.getAttribute?.('data-content-search-unit-key');
  return {node,text:node.textContent||'',id:node.getAttribute?.('data-message-id')||
    (ids?[...new Set(ids.trim().split(/\s+/))].join(' '):null)||
    (key&&!key.startsWith('fallback-')?key:null)};
};
const sameIdentity=(before,node)=>before.node===node||Boolean(before.id&&before.id===describe(node).id);
const same=(before,node)=>before.text===(node.textContent||'')&&sameIdentity(before,node);
const userText=node=>{
  const content=node.querySelector?.('[data-testid="message-content"],[data-message-content],.whitespace-pre-wrap')||node;
  return content.innerText??content.textContent??'';
};
const appended=(before,nodes,multiple=false)=>{
  if(!before.length)return multiple?nodes.length>=1:nodes.length===1;
  if(multiple){
    // Earlier ChatGPT replies can hydrate after the latest reply is complete.
    // The unchanged latest reply anchors this new answer; older placeholder
    // text is not part of its identity. User history remains checked below.
    // Exactly one reply may follow that anchor; multiple new replies are ambiguous.
    const anchors=nodes.map((node,index)=>same(before.at(-1),node)?index:-1).filter(index=>index>=0);
    return anchors.length===1&&anchors[0]===nodes.length-2&&
      !before.some(item=>sameIdentity(item,nodes.at(-1)));
  }
  const offset=before.findIndex(item=>same(item,nodes[0]||{}));
  const count=before.length-offset+1;
  return offset>=0&&nodes.length===count&&
    before.slice(offset).every((item,index)=>same(item,nodes[index]))&&
    !before.some(item=>sameIdentity(item,nodes.at(-1)));
};

export function createChatGPTTaskDiscovery({now=Date.now,onStatus=()=>{}}={}){
  let route=null,before=null,pending=null,submission=null;
  let diagnostic={stage:'idle',reason:'no-native-submission',route:null};
  const history=[];
  const report=(stage,reason)=>{
    if(diagnostic.stage===stage&&diagnostic.reason===reason&&diagnostic.route===route)return;
    diagnostic={stage,reason,route};history.push({...diagnostic});if(history.length>8)history.shift();
    onStatus({...diagnostic,history:history.map(item=>({...item}))});
  };
  const capture=snapshot=>({users:snapshot.users.map(describe),assistants:snapshot.assistants.map(describe)});
  return {
    status(){return {...diagnostic,history:history.map(item=>({...item}))};},
    reset(snapshot,reason='baseline'){
      const witnessed=!!submission;
      route=snapshot?.ok?snapshot.route:null;
      before=snapshot?.ok?capture(snapshot):null;pending=null;submission=null;
      report(witnessed&&reason!=='baseline'?'rejected':'idle',reason);
    },
    // Called only by the fixed page adapter after a native composer gesture.
    // Capture at that gesture, not the previous poll: history may hydrate in
    // between. An unobserved send is never inferred from appended DOM alone.
    witnessSubmission(snapshot){
      if(!snapshot?.ok||!snapshot.route||snapshot.busy||!snapshot.idle||snapshot.rich||
        typeof snapshot.draft!=='string'||!snapshot.draft.trim())return false;
      this.reset(snapshot);
      submission={text:snapshot.draft,expiresAt:now()+30000,
        firstMessage:route.startsWith('new:')&&!before.users.length&&!before.assistants.length};
      report('submitted','native-submission-witnessed');
      return true;
    },
    // The official UI can transiently mark a new turn cancelled before its
    // response begins. Only the native Stop gesture retires the send witness.
    witnessCancellation(snapshot){
      if(!submission||!snapshot?.ok||snapshot.route!==route)return false;
      this.reset(snapshot);report('cancelled','native-stop-witnessed');return true;
    },
    observe(snapshot){
      if(!snapshot?.ok){
        // A same-route editor remount pauses observation, not turn identity.
        const next=snapshot?.route;
        if(submission?.firstMessage&&next&&
          (route.startsWith('new:')&&next.startsWith('pending/')&&
            (!submission.provisionalRoute||submission.provisionalRoute===next)||
           pending&&next.startsWith('c/')&&(!submission.formalRoute||submission.formalRoute===next))){
          if(next.startsWith('pending/'))submission.provisionalRoute=next;
          else submission.formalRoute=next;
          report('submitted','first-composer-remount');return null;
        }
        if(!route||snapshot?.route!==route)this.reset(null,'route-unavailable-before-binding');
        return null;
      }
      if(snapshot.route!==route||!before){
        // Only transfer the user already observed after a native first send.
        // Matching history first seen in another route cannot consume it.
        if(submission?.firstMessage&&route?.startsWith('new:')&&snapshot.route?.startsWith('pending/')&&
          (!submission.provisionalRoute||submission.provisionalRoute===snapshot.route)){
          route=snapshot.route;submission.provisionalRoute=route;
        }else if(submission?.firstMessage&&pending&&snapshot.route?.startsWith('c/')&&
          (!submission.formalRoute||submission.formalRoute===snapshot.route)&&
          snapshot.users.length===1&&same(pending.user,snapshot.users[0])){
          route=snapshot.route;submission.firstMessage=false;
        }
        else {this.reset(snapshot,'conversation-changed-before-binding');return null;}
      }
      const users=snapshot.users,assistants=snapshot.assistants;
      // There is no reliable "history finished" DOM state. Complete batches,
      // remounts and regeneration all remain history without a witnessed send.
      if(!submission||!pending&&now()>=submission.expiresAt){this.reset(snapshot,'no-live-submission');return null;}
      if(pending&&(!same(pending.user,users.at(-1)||{})||!appended(before.users,users))){
        this.reset(snapshot,'observed-user-changed');return null;
      }
      if(!pending){
        if(appended(before.users,users)){
          if(userText(users.at(-1))!==submission.text){this.reset(snapshot,'submitted-text-mismatch');return null;}
          pending={user:describe(users.at(-1)),assistants:before.assistants};
          report('waiting-reply','exact-new-user-observed');
        }
        else {
          // Preserve a witnessed send across the gap before its user node,
          // but a changed user baseline consumes it without adopting anything.
          if(users.length!==before.users.length||
            !before.users.every((item,index)=>same(item,users[index])))this.reset(snapshot,'user-baseline-changed');
          return null;
        }
      }
      if(route.startsWith('new:')||route.startsWith('pending/')||snapshot.busy||!snapshot.idle||!snapshot.answerComplete)return null;
      const next=assistants.at(-1),user=users.at(-1);
      if(!next||!appended(pending.assistants,assistants,true)){
        // Sending a user message can precede the first streaming DOM node.
        // Keep waiting for that answer; completion of the previous one is not
        // completion of this new turn.
        return null;
      }
      const order=user.compareDocumentPosition?.(next);
      if(order!==undefined&&((order&1)||!(order&4))){this.reset(snapshot);return null;}
      this.reset(snapshot); // Emit once, including when the prepare ACK is lost.
      report('eligible','unique-complete-reply-observed');
      return {user,answer:next};
    }
  };
}
