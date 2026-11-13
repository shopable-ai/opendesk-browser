import assert from 'node:assert/strict';

export async function runTurnCountBrowserChecks(page) {
  await page.reload();
  await page.waitForSelector('[data-opendesk-ai-scroll-navigation="dock"]',{state:'visible'});
  const state=()=>page.evaluate(()=>{
    const host=document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]');
    const counter=host.shadowRoot.querySelector('.counter'),box=host.getBoundingClientRect();
    const controls=[...host.shadowRoot.querySelectorAll('button')];
    return {count:counter?.textContent??null,overflow:counter?counter.scrollWidth>counter.clientWidth:false,
      buttons:controls.length,sameButtons:controls.every((node,i)=>node===window.countButtons[i]),
      top:document.querySelector('main').scrollTop,
      width:box.width,height:box.height,left:box.left,right:box.right,
      viewport:innerWidth,visible:getComputedStyle(host).visibility==='visible'};
  });
  await page.evaluate(()=>{
    window.countButtons=[...document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
      .shadowRoot.querySelectorAll('button')];
  });
  const hidden=await state();assert.equal(hidden.count,null);
  await page.evaluate(()=>window.scrollNavigationFixture.setFlags({turnPaging:true,showTurnCount:true}));
  assert.equal((await state()).count,'1/3');
  await page.click('button[data-scroll-nav-key="turnNext"]');
  await page.waitForFunction(()=>document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
    .shadowRoot.querySelector('.counter')?.textContent==='2/3');
  const middle=await state();assert.ok(middle.top>0);
  await page.evaluate(()=>window.scrollNavigationFixture.setFlags({turnPaging:true,showTurnCount:false}));
  const removed=await state();assert.equal(removed.count,null);assert.equal(removed.top,middle.top);
  assert.equal(removed.width,hidden.width);assert.equal(removed.height,hidden.height);
  await page.evaluate(()=>{
    window.scrollNavigationFixture.transcript(120);
    window.scrollNavigationFixture.setFlags({turnPaging:true,showTurnCount:true});
  });
  await page.click('button[aria-label="跳到对话底部"]');
  await page.waitForFunction(()=>document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
    .shadowRoot.querySelector('.counter')?.textContent==='120/120');
  const long=await state();assert.equal(long.overflow,false);assert.equal(long.visible,true);
  assert.ok(long.left>=0&&long.right<=long.viewport,'expanded count stays in the viewport');
  await page.evaluate(()=>{
    document.querySelector('#messages').firstElementChild.removeAttribute('data-role');
    window.scrollNavigationFixture.refresh();
  });
  const uncertain=await state();assert.equal(uncertain.count,null);
  await page.evaluate(()=>{
    document.querySelector('#messages').firstElementChild.setAttribute('data-role','user');
    window.scrollNavigationFixture.refresh();
  });
  const recovered=await state();assert.equal(recovered.count,'120/120');
  await page.click('button[data-scroll-nav-key="turnPrevious"]');
  await page.waitForFunction(top=>document.querySelector('main').scrollTop<top,recovered.top);
  await page.click('button[data-scroll-nav-key="turnPrevious"]');
  await page.waitForFunction(()=>document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
    .shadowRoot.querySelector('.counter')?.textContent==='119/120');
  await page.click('button[aria-label="回到对话顶部"]');
  await page.waitForFunction(()=>document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
    .shadowRoot.querySelector('.counter')?.textContent==='1/120');
  for(const result of [hidden,middle,removed,long,uncertain,recovered]){
    assert.equal(result.buttons,4);assert.equal(result.sameButtons,true);
  }
  return {status:'PASS',scope:'actual project modules in synthetic DOM, not installed',
    hidden,middle,removed,long,uncertain,recovered};
}

// Accept an ego-browser Page already on fixtures/floating-navigation.html.
// These are real browser interactions with project modules, not an installed Page test.
export async function runVisibilityBrowserChecks(page) {
  const cases=[];
  const state=()=>page.evaluate(()=>{
    const host=document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]');
    const buttons=[...host.shadowRoot.querySelectorAll('button')],main=document.querySelector('main');
    const box=host.getBoundingClientRect();
    return {visible:getComputedStyle(host).visibility==='visible',count:buttons.length,
      disabled:buttons.map(button=>(button.getAttribute('aria-disabled')==='true')),
      sameButtons:buttons.every((button,i)=>button===window.visibilityButtons?.[i]),
      top:main.scrollTop,max:main.scrollHeight-main.clientHeight,
      left:box.left,y:box.top,width:box.width,height:box.height};
  });
  const waitDisabled=async expected=>{
    await page.waitForFunction(expected=>{
      const buttons=[...document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
        .shadowRoot.querySelectorAll('button')];
      return buttons.length===4&&buttons.every((button,i)=>(button.getAttribute('aria-disabled')==='true')===expected[i]);
    },expected);
    const result=await state();assert.equal(result.visible,true);assert.equal(result.count,4);
    assert.equal(result.sameButtons,true);return result;
  };
  for(const site of ['chatgpt','deepseek','gemini']) {
    await page.selectOption('#site',site);
    await page.evaluate(()=>{
      window.visibilityButtons=[...document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
        .shadowRoot.querySelectorAll('button')];
    });
    const first=await waitDisabled([true,true,false,false]);
    await page.click('button[aria-label="下一轮提问"]');
    const middle=await waitDisabled([false,false,false,false]);assert.ok(middle.top>0);
    await page.click('button[aria-label="下一轮提问"]');
    const last=await waitDisabled([false,false,true,false]);assert.ok(last.top>middle.top);
    await page.click('button[data-scroll-nav-key="turnPrevious"]');
    const previous=await waitDisabled([false,false,false,false]);assert.ok(previous.top<last.top);
    await page.click('button[aria-label="跳到对话底部"]');
    const bottom=await waitDisabled([false,false,true,true]);assert.equal(bottom.top,bottom.max);
    await page.click('button[data-scroll-nav-key="turnPrevious"]');
    const latest=await waitDisabled([false,false,true,false]);
    assert.equal(latest.top,last.top,'up from the bottom first returns to the latest question');
    await page.click('button[data-scroll-nav-key="turnPrevious"]');
    const preceding=await waitDisabled([false,false,false,false]);
    assert.equal(preceding.top,middle.top,'a second up click reaches the preceding question');
    await page.click('button[aria-label="回到对话顶部"]');
    await waitDisabled([true,true,false,false]);

    await page.evaluate(site=>{
      const first=document.querySelector('#messages').firstElementChild;
      if(site==='gemini')first.hidden=true;
      else first.removeAttribute('data-role');
    },site);
    const uncertain=await waitDisabled([true,true,true,false]);
    assert.equal(uncertain.left,first.left);assert.equal(uncertain.y,first.y);
    await page.evaluate(site=>{
      const first=document.querySelector('#messages').firstElementChild;
      if(site==='gemini')first.hidden=false;
      else first.setAttribute('data-role','user');
    },site);
    await waitDisabled([true,true,false,false]);

    await page.evaluate(()=>window.scrollNavigationFixture.transcript(1));
    const single=await waitDisabled([true,true,true,false]);
    await page.click('button[aria-label="跳到对话底部"]');
    await waitDisabled([false,false,true,true]);
    await page.click('button[data-scroll-nav-key="turnPrevious"]');
    const singleQuestion=await waitDisabled([false,true,true,false]);
    assert.ok(singleQuestion.top<single.max,'single long reply has a return-to-question target');
    await page.evaluate(()=>window.scrollNavigationFixture.transcript(3));
    await waitDisabled([true,true,false,false]);
    await page.evaluate(()=>window.visibilityButtons[2].click());
    assert.equal((await state()).top,0,'untrusted clicks cannot navigate');

    // Exercise the captured element-scroll listener with actual wheel input.
    await page.mouse.move(300,250);
    await page.mouse.wheel(0,900);
    await page.waitForFunction(()=>document.querySelector('main').scrollTop>100);
    await page.waitForFunction(()=>window.visibilityButtons[0].getAttribute('aria-disabled')!=='true');
    const manual=await state();assert.equal(manual.count,4);assert.equal(manual.sameButtons,true);
    await page.click('button[aria-label="回到对话顶部"]');
    await waitDisabled([true,true,false,false]);

    await page.evaluate(()=>{
      document.querySelector('#messages').style.padding='0 88px';
      for(const node of document.querySelector('#messages').children)
        node.style.cssText='min-height:0;height:24px;padding:0;margin:0';
    });
    const fitting=await waitDisabled([true,true,true,true]);assert.equal(fitting.max,0);
    await page.evaluate(()=>document.querySelector('#messages').style.padding='');
    cases.push({site,status:'PASS',first,middle,last,previous,bottom,latest,preceding,uncertain,single,singleQuestion,manual,fitting});
  }
  return {scope:'synthetic site DOM with actual project modules; no installation/Authority claim',cases};
}

export async function runNavigationAccessibilityChecks(page,{screenshotDir}={}) {
  await page.reload();
  await page.waitForSelector('[data-opendesk-ai-scroll-navigation="dock"]',{state:'visible'});
  const selector=key=>`button[data-scroll-nav-key="${key}"]`;
  const state=()=>page.evaluate(()=>{
    const host=document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]');
    const focused=host.shadowRoot.activeElement;
    return {top:document.querySelector('main').scrollTop,
      focused:focused?.dataset.scrollNavKey,
      unavailable:focused?.getAttribute('aria-disabled')==='true',
      hint:focused?.querySelector('.hint').textContent,
      hintVisible:focused?getComputedStyle(focused.querySelector('.hint')).visibility==='visible':false};
  });
  // Ego's element-action guard treats aria-disabled as non-actionable even
  // for focus(). Real Tab input exercises the browser's actual focus path.
  await page.focus('#site');
  for(let attempt=0;attempt<12&&(await state()).focused!=='conversationTop';attempt++)
    await page.keyboard.press('Tab');
  const topReason=await state();assert.equal(topReason.unavailable,true);assert.equal(topReason.hintVisible,true);
  assert.equal(topReason.focused,'conversationTop');
  await page.keyboard.press('Tab');
  const firstReason=await state();assert.equal(firstReason.focused,'turnPrevious');assert.equal(firstReason.unavailable,true);
  assert.equal(firstReason.hintVisible,true);
  await page.keyboard.press('Tab');
  assert.equal((await state()).focused,'turnNext');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('main').scrollTop===792);
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('main').scrollTop===1572);
  await page.keyboard.press('Tab');
  assert.equal((await state()).focused,'conversationBottom');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('main').scrollTop===1876);
  await page.waitForFunction(()=>document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
    .shadowRoot.querySelector('[data-scroll-nav-key="turnNext"]').getAttribute('aria-disabled')==='true');
  await page.keyboard.press('Shift+Tab');
  const bottomReason=await state();assert.equal(bottomReason.focused,'turnNext');
  assert.equal(bottomReason.unavailable,true);assert.equal(bottomReason.hintVisible,true);
  await page.keyboard.press('Enter');assert.equal((await state()).top,1876,'unavailable activation only explains the boundary');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('main').scrollTop===1572);
  await page.mouse.move(300,250);
  await page.hover(selector('turnPrevious'));
  const hintBox=await page.evaluate(()=>document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
    .shadowRoot.querySelector('[data-scroll-nav-key="turnPrevious"] .hint').getBoundingClientRect().toJSON());
  await page.mouse.move(hintBox.left+4,hintBox.top+4);
  const hoverable=(await state()).hintVisible;assert.equal(hoverable,true);
  await page.keyboard.press('Escape');
  const dismissed=!(await state()).hintVisible;assert.equal(dismissed,true);
  await page.mouse.move(300,250);
  await page.click(selector('conversationBottom'));
  await page.waitForFunction(()=>document.querySelector('main').scrollTop===1876);
  let touch,narrow;
  try {
    await page.cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await page.waitForFunction(()=>document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]').getBoundingClientRect().height===180);
    const tap=async key=>{
      const point=await page.evaluate(key=>{
        const box=document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
          .shadowRoot.querySelector(`[data-scroll-nav-key="${key}"]`).getBoundingClientRect();
        return {x:box.left+box.width/2,y:box.top+box.height/2};
      },key);
      await page.cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:0}]});
      await page.cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    await tap('turnNext');
    const disabledTouch=await page.evaluate(()=>{
      const host=document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]');
      const button=host.shadowRoot.querySelector('[data-scroll-nav-key="turnNext"]');
      return {top:document.querySelector('main').scrollTop,hint:button.querySelector('.hint').textContent,
        visible:getComputedStyle(button.querySelector('.hint')).visibility==='visible'};
    });
    assert.equal(disabledTouch.top,1876);assert.equal(disabledTouch.visible,true);
    await tap('turnPrevious');
    await page.waitForFunction(()=>document.querySelector('main').scrollTop===1572);
    await page.waitForFunction(()=>document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]')
      .shadowRoot.querySelector('[data-scroll-nav-key="turnPrevious"]').getAttribute('aria-label')==='上一轮提问');
    touch={disabledTouch,enabledTouchTop:1572};
    if(screenshotDir)await page.screenshot({path:screenshotDir+'/after-touch.png'});
    await page.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:600,deviceScaleFactor:1,mobile:false});
    await page.waitForFunction(()=>document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]').shadowRoot.querySelector('.stack').classList.contains('compact'));
    narrow=await page.evaluate(()=>{
      const host=document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]');
      return {box:host.getBoundingClientRect().toJSON(),heights:[...host.shadowRoot.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height)};
    });
    assert.deepEqual(narrow.heights,[42,42,42,42]);assert.ok(narrow.box.left>=0&&narrow.box.right<=390);
    if(screenshotDir)await page.screenshot({path:screenshotDir+'/after-narrow.png'});
  } finally {
    await page.cdp('Emulation.clearDeviceMetricsOverride');
    await page.cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
  }
  return {status:'PASS',topReason,firstReason,bottomReason,hoverable,dismissed,touch,narrow};
}
