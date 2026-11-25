// Pass this script to ego-browser nodejs after defining EGO_TEST_SPACE and EGO_TEST_URL.
const task=await taskSpace(EGO_TEST_SPACE);
const page=typeof EGO_TEST_PAGE==='undefined'?await task.newPage():task.page(EGO_TEST_PAGE);
const assert=(condition,message)=>{if(!condition)throw Error(message);};
await page.goto(EGO_TEST_URL);

const read=(key)=>page.evaluate(key=>{
  const host=document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]');
  const root=host?.shadowRoot,port=document.querySelector('main');
  if(!root)return null;
  const edge=port.getBoundingClientRect();
  const button=key&&root.querySelector('button[data-scroll-nav-key="'+key+'"]');
  const rect=button?.getBoundingClientRect();
  const x=rect&&rect.x+rect.width/2,y=rect&&rect.y+rect.height/2;
  const answer=port.querySelector('[data-answer="3"]')?.getBoundingClientRect();
  return {count:root.querySelector('.counter')?.textContent,top:port.scrollTop,
    max:port.scrollHeight-port.clientHeight,
    lastAnswerVisible:!!answer&&answer.bottom>edge.top&&answer.top<edge.bottom,
    questions:[...port.querySelectorAll('[data-question]')].map(node=>
      [Number(node.dataset.question),Math.round(node.getBoundingClientRect().top-edge.top)]),
    button:rect&&{x,y,disabled:button.getAttribute('aria-disabled')==='true',
      hit:document.elementFromPoint(x,y)===host&&root.elementFromPoint(x,y)?.closest('button')===button}};
},key??null);

async function expect(step,count,{question,landing,bottom,top}={}){
  let state;
  for(let i=0;i<50;i++){
    state=await read();
    if(state?.count===count&&(!question||state.questions.some(([id,y])=>id===question&&
        (landing?Math.abs(y-12)<=2:y>=0&&y<=90)))&&
        (!bottom||state.max-state.top<=2&&state.lastAnswerVisible)&&(!top||state.top<=2))return state;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw Error(step+': '+JSON.stringify(state));
}
async function click(key,count,condition,{disabled=false}={}){
  const before=await read(key);
  assert(before?.button?.hit&&before.button.disabled===disabled,key+': '+JSON.stringify(before));
  // A coordinate click exercises the actual disabled boundary as well.
  await page.mouse.click(before.button.x,before.button.y,{label:'Test '+key+' navigation'});
  if(disabled)await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const after=await expect(key,count,condition);
  assert(!disabled||Math.abs(after.top-before.top)<=2,key+' moved at boundary');
  console.log({key,disabled,...after});
}

console.log({initial:await expect('initial bottom','3/3',{bottom:true})});
await click('floatingTop','1/3',{question:1,top:true});
await click('conversationTop','1/3',{question:1,top:true},{disabled:true});
await click('turnNext','2/3',{question:2,landing:true});
await click('turnNext','3/3',{question:3,landing:true});
await click('turnNext','3/3',{question:3,landing:true},{disabled:true});
await click('turnPrevious','2/3',{question:2,landing:true});
await click('turnPrevious','1/3',{question:1,landing:true});
await click('turnPrevious','1/3',{question:1,landing:true},{disabled:true});
await click('conversationBottom','3/3',{bottom:true});
await click('conversationBottom','3/3',{bottom:true},{disabled:true});
