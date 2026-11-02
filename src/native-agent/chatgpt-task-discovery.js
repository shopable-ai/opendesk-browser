// Eligibility only. This observer never grants permission, parses a task, or
// runs code. The existing Host and durable trigger ledger own those decisions.
const describe=node=>({node,text:node.textContent||'',id:
  node.getAttribute?.('data-message-id')||
  node.getAttribute?.('data-chatgpt-search-unit-key')||
  node.getAttribute?.('data-content-search-unit-key')||null});
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

export function createChatGPTTaskDiscovery({now=Date.now}={}){
  let route=null,before=null,pending=null,submission=null;
  const capture=snapshot=>({users:snapshot.users.map(describe),assistants:snapshot.assistants.map(describe)});
  return {
    reset(snapshot){
      route=snapshot?.ok?snapshot.route:null;
      before=snapshot?.ok?capture(snapshot):null;pending=null;submission=null;
    },
    // Called only by the fixed page adapter after a native composer gesture.
    // Capture at that gesture, not the previous poll: history may hydrate in
    // between. An unobserved send is never inferred from appended DOM alone.
    witnessSubmission(snapshot){
      if(!snapshot?.ok||!snapshot.route||snapshot.busy||!snapshot.idle||snapshot.rich||
        typeof snapshot.draft!=='string'||!snapshot.draft.trim())return false;
      this.reset(snapshot);
      submission={text:snapshot.draft,expiresAt:now()+30000};
      return true;
    },
    observe(snapshot){
      if(!snapshot?.ok){
        // A same-route editor remount pauses observation, not turn identity.
        if(!route||snapshot?.route!==route)this.reset(null);
        return null;
      }
      if(snapshot.route!==route||!before){this.reset(snapshot);return null;}
      const users=snapshot.users,assistants=snapshot.assistants;
      // There is no reliable "history finished" DOM state. Complete batches,
      // remounts and regeneration all remain history without a witnessed send.
      if(!submission||!pending&&now()>=submission.expiresAt){this.reset(snapshot);return null;}
      if(pending&&(!same(pending.user,users.at(-1)||{})||!appended(before.users,users))){
        this.reset(snapshot);return null;
      }
      if(!pending){
        if(appended(before.users,users)){
          if(userText(users.at(-1))!==submission.text){this.reset(snapshot);return null;}
          pending={user:describe(users.at(-1)),assistants:before.assistants};
        }
        else {
          // Preserve a witnessed send across the gap before its user node,
          // but a changed user baseline consumes it without adopting anything.
          if(users.length!==before.users.length||
            !before.users.every((item,index)=>same(item,users[index])))this.reset(snapshot);
          return null;
        }
      }
      if(snapshot.busy||!snapshot.idle||!snapshot.answerComplete)return null;
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
      return {user,answer:next};
    }
  };
}
