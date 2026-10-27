// Eligibility only. This observer never grants permission, parses a task, or
// runs code. The existing Host and durable trigger ledger own those decisions.
const describe=node=>({node,text:node.textContent||'',id:
  node.getAttribute?.('data-message-id')||
  node.getAttribute?.('data-chatgpt-search-unit-key')||
  node.getAttribute?.('data-content-search-unit-key')||null});
const same=(before,node)=>before.text===(node.textContent||'')&&
  (before.node===node||Boolean(before.id&&before.id===describe(node).id));
const appended=(before,nodes,multiple=false)=>{
  if(!before.length)return multiple?nodes.length>=1:nodes.length===1;
  const offset=before.findIndex(item=>same(item,nodes[0]||{}));
  const count=before.length-offset+1;
  return offset>=0&&(multiple?nodes.length>=count:nodes.length===count)&&
    before.slice(offset).every((item,index)=>same(item,nodes[index]))&&
    !before.some(item=>same(item,nodes.at(-1)));
};

export function createChatGPTTaskDiscovery(){
  let route=null,before=null,pending=null;
  const capture=snapshot=>({users:snapshot.users.map(describe),assistants:snapshot.assistants.map(describe)});
  return {
    reset(snapshot){
      route=snapshot?.ok?snapshot.route:null;
      before=snapshot?.ok?capture(snapshot):null;pending=null;
    },
    observe(snapshot){
      if(!snapshot?.ok){this.reset(null);return null;}
      if(snapshot.route!==route||!before){this.reset(snapshot);return null;}
      const users=snapshot.users,assistants=snapshot.assistants;
      if(pending&&!same(pending.user,users.at(-1)||{})){
        this.reset(snapshot);return null;
      }
      if(!pending){
        if(appended(before.users,users))pending={user:describe(users.at(-1)),assistants:before.assistants};
        else {
          // Includes initial streaming replies, regenerated old answers, and
          // history remounts without a retained user anchor. Never adopt them.
          if(!snapshot.busy&&snapshot.answerComplete)this.reset(snapshot);
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
