async function main() {
  const checks=[];
  function assert(value,expected){if(value!==expected)throw new Error('Expected '+expected+'; got '+value)}
  async function test(name,fn){try{await fn();checks.push({name,pass:true})}catch(e){checks.push({name,pass:false,code:e.code,message:e.message})}}
  async function rejects(fn,code){try{await fn()}catch(e){assert(e.code,code);return}throw new Error('Expected '+code)}
  await test('native label replaces prefilled input',async()=>{await page.getByLabel('原生标签',{exact:true}).fill('OpenDesk');assert(await page.locator('#value-native').textContent(),'OpenDesk')});
  await test('in-document replacement and disabled auto-wait',async()=>{await page.getByRole('button',{name:'重绘后提交',exact:true}).click();assert(JSON.parse(await page.locator('#counts').textContent()).redraw,1)});
  await test('input clear',async()=>{await page.getByLabel('原生标签').fill('');assert(await page.locator('#value-native').textContent(),'')});
  await test('aria-label',async()=>{await page.getByLabel('ARIA 输入',{exact:true}).fill('ARIA');assert(await page.locator('#value-aria').textContent(),'ARIA')});
  await test('aria-labelledby',async()=>{await page.getByLabel('引用标签',{exact:true}).fill('Referenced');assert(await page.locator('#value-reference').textContent(),'Referenced')});
  await test('textarea replacement and clear',async()=>{await page.getByLabel('多行输入').fill('New\nvalue');assert(await page.locator('#value-area').textContent(),'New\nvalue');await page.getByLabel('多行输入').fill('');assert(await page.locator('#value-area').textContent(),'')});
  await test('strict duplicate names',()=>rejects(()=>page.getByRole('button',{name:'同名',exact:true}).click({timeout:200}),'E_STRICT_MODE_VIOLATION'));
  await test('form scope',()=>page.getByRole('form',{name:'范围表单',exact:true}).getByRole('button',{name:'同名',exact:true}).click());
  await test('dialog scope',()=>page.getByRole('dialog',{name:'设置面板',exact:true}).getByRole('button',{name:'同名',exact:true}).click());
  await test('container scope',()=>page.locator('#container').getByRole('button',{name:'同名',exact:true}).click());
  for(const [name,id,action]of [['disabled','disabled','click'],['aria-disabled','aria-disabled','click'],['readOnly','readonly','fill'],['aria-readonly','aria-readonly','fill'],['pointer-events','no-pointer','click'],['cover','covered','click'],['animation','moving','click']])await test(name,()=>rejects(()=>action==='fill'?page.locator('#'+id).fill('blocked',{timeout:160}):page.locator('#'+id).click({timeout:160}),'E_TIMEOUT'));
  const full=await page.observe({maxNodes:200,maxDepth:8,maxChars:16000});
  const small=await page.observe({maxNodes:1,maxChars:256});
  await test('bounded observation and truncation',async()=>{assert(full.truncated,true);assert(small.truncated,true);assert(full.budget.visited<=full.budget.maxVisited,true);assert(full.budget.locatorChecks<=full.budget.maxLocatorChecks,true)});
  await test('observation input privacy',async()=>{for(const secret of ['PASSWORD_VALUE_MUST_NOT_LEAK','PRIVATE_UNNECESSARY_INPUT','PRIVATE_INPUT_VALUE'])assert(JSON.stringify(full).includes(secret),false)});
  function locate(d){let root=d.parent?locate(d.parent):page;if(d.kind==='css')return root.locator(d.value);if(d.kind==='role')return root.getByRole(d.value,{name:d.name,exact:d.exact});if(d.kind==='label')return root.getByLabel(d.value,{exact:d.exact});if(d.kind==='text')return root.getByText(d.value,{exact:d.exact});return root.getByTestId(d.value)}
  const suggested=full.nodes.filter(n=>n.locator);
  await test('suggestions re-locate uniquely',async()=>{for(const row of suggested)assert(await locate(row.locator).count(),1)});
  const counts=JSON.parse(await page.locator('#counts').textContent());
  await test('negative cases have no click effects',async()=>{for(const id of ['disabled','aria-disabled','no-pointer','covered','moving'])assert(counts[id]||0,0)});
  return {checks,counts,full,small,suggested:suggested.length};
}
