import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {composeExtensionEntries,resolveExtensionRowIntent,resolveExtensionPrimaryAction} from '../../src/ui/extension-center-model.js';

test('R4.2 enabled installed app launches its installed package; missing app opens detail',()=>{
  const installed={id:'notes',title:'Notes',description:'编辑笔记',version:'1.0.0'};
  const latest={toolId:'notes',packageTitle:'Notes',description:'新版',version:'1.1.0'};
  const missing={toolId:'mind-map',packageTitle:'Mind Map',description:'思维导图',version:'1.0.0',installationPolicy:'preinstalled'};
  const rows=composeExtensionEntries({installed:[installed],official:[latest,missing]});
  assert.equal(rows.find(row=>row.id==='notes').update,true);
  assert.equal(resolveExtensionRowIntent(rows.find(row=>row.id==='notes')),'launch');
  assert.equal(resolveExtensionRowIntent(rows.find(row=>row.id==='mind-map')),'detail');
  assert.equal(resolveExtensionRowIntent(null),'detail');
  assert.equal(resolveExtensionRowIntent({installed:true,kind:'unknown',enabled:true}),'detail');
});

test('R4.7 main action is genuinely optional for disabled/unknown/Page/candidates',()=>{
  for(const enabled of [false,undefined,null]){
    const row={installed:true,kind:'app',enabled};
    assert.equal(resolveExtensionRowIntent(row),'detail');
    assert.equal(resolveExtensionPrimaryAction(row),null);
  }
  for(const enabled of [true,false]){
    const row={installed:true,kind:'page',enabled};
    assert.equal(resolveExtensionRowIntent(row),'detail');
    assert.equal(resolveExtensionPrimaryAction(row),null);
  }
  for(const row of [
    null,{installed:false,kind:'app',release:{id:'genuine'},enabled:false},
    {installed:true,kind:'app',enabled:true,stateKnown:false},
    {installed:true,kind:'unknown',enabled:true}
  ]){
    assert.equal(resolveExtensionPrimaryAction(row),null,'unverified preview/open cannot be invented');
  }
  assert.deepEqual(resolveExtensionPrimaryAction({installed:true,kind:'app',enabled:true}),
    {id:'open',label:'打开'});
});

test('R4.7 full row delegates to exactly the same optional primary action',async()=>{
  const center=await readFile('src/ui/extension-center.js','utf8');
  for(const marker of [
    'resolveExtensionPrimaryAction(row)',
    "const main=button('',()=>openRow(row.key),'ec-row-main')",
    "const actions=node('span','ec-row-actions')",
    "if(primaryAction){",
    "const primary=button(primaryAction.label,()=>openRow(row.key)",
    "if(row.installed){",
    "manage.dataset.extensionAction='more'",
    "event=>showRowMenu(row.key,event.currentTarget)",
    "item.append(main,actions)",
    "restoreRowFocus(focusKey,focusAction)",
    "if(resolveExtensionRowIntent(row)==='detail'){openDetail(key,'main');return;}",
    "if(resolveExtensionPrimaryAction(row)?.id==='open')sidebarTools.openTool(row.id)"
  ])assert.ok(center.includes(marker),'missing row/route contract '+marker);
  assert.doesNotMatch(center,/const actionName=!row\.installed/);
  assert.doesNotMatch(center,/!row\.enabled\?sidebarTools\.openSettings/);
  assert.doesNotMatch(center,/if\(!row\.installed\)\{openReview\(key\);return;\}/);
  assert.match(center,/closeRowMenu\(true\);fn\(event\)/);
  assert.match(center,/rowMenu\.setAttribute\('role','menu'\)/);
  assert.match(center,/doc\.addEventListener\('scroll',onScroll,true\)/);
  assert.match(center,/row\.stateKnown===false\?'状态待核对'/);
  assert.match(center,/row\.enabled===false\?'已停用'/);
  assert.match(center,/row\.kind==='page'&&row\.record\?\.installed\?\.authorization\?\.status==='suspended'/);
  assert.match(center,/setInstalledPageProgramEnabled\(\{api,client,row:row\.record\}\)/);
});

test('R4.7 actions remain visible, overflow is not clipped and touch stays reachable',async()=>{
  const css=await readFile('src/ui/extension-center.css','utf8');
  const row=css.match(/\.ec-row\{([^}]*)\}/)?.[1]||'';
  const main=css.match(/\.ec-row-main\{([^}]*)\}/)?.[1]||'';
  const overlay=css.match(/\.ec-row-actions\{([^}]*)\}/)?.[1]||'';
  assert.match(row,/position:relative/);
  assert.match(row,/min-height:72px/);
  assert.match(main,/grid-template-columns:34px minmax\(0,1fr\)/);
  assert.match(main,/width:100%/);
  assert.match(overlay,/position:absolute/);
  assert.match(overlay,/opacity:1;pointer-events:auto/);
  assert.match(css,/\.ec-row--has-primary \.ec-row-main\{padding-right:108px\}/);
  assert.match(css,/\.ec-row--no-actions \.ec-row-main\{padding-right:10px\}/);
  assert.match(css,/\.ec-context-menu\{position:fixed;z-index:1000/);
  assert.match(css,/\.ec-context-menu\[hidden\]\{display:none!important\}/);
  assert.match(css,/@media\(hover:none\),\(pointer:coarse\)/);
  assert.match(css,/@media\(max-width:240px\)/);
  assert.match(css,/#extension-center \.ec-row-main:focus-visible/);
  assert.doesNotMatch(css,/\.ec-row-actions\{[^}]*opacity:0/);
});

test('R4.3 list and detail foregrounds remain readable against normal and hover surfaces in both themes',async()=>{
  const css=await readFile('src/ui/extension-center.css','utf8');
  const tokens=await readFile('src/ui/design-tokens.css','utf8');
  const declarations=body=>Object.fromEntries([...body.matchAll(/(--[\w-]+):([^;]+);/g)].map(([,key,value])=>[key,value]));
  const roots=[...tokens.matchAll(/:root\{([^}]+)\}/g)].map(([,body])=>declarations(body));
  const luminance=hex=>{
    const full=hex.length===4?'#'+[...hex.slice(1)].map(c=>c+c).join(''):hex;
    return [0.2126,0.7152,0.0722].reduce((sum,weight,i)=>{
      const v=parseInt(full.slice(1+2*i,3+2*i),16)/255;
      return sum+weight*(v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
    },0);
  };
  for(const theme of ['light','dark']){
    const palette={...roots[0],...(theme==='dark'?roots[1]:{})};
    const resolve=value=>value.replace(/var\((--[\w-]+)\)/g,(_,name)=>resolve(palette[name]));
    for(const [selector,minimum] of [['.ec-action',4.5],['.ec-detail-back',4.5],['.ec-detail-actions button',4.5],['.ec-glyph',3]]){
      const rule=css.slice(css.indexOf(selector+'{')+selector.length+1).split('}')[0];
      const foreground=resolve(rule.match(/(?:^|;)color:([^;]+)/)[1]);
      for(const background of ['--od-paper','--od-muted']){
        const values=[luminance(foreground),luminance(resolve(palette[background]))].sort((a,b)=>a-b);
        const ratio=(values[1]+0.05)/(values[0]+0.05);
        assert.ok(ratio>=minimum,`${theme} ${selector} against ${background}: ${ratio.toFixed(2)} < ${minimum}`);
      }
    }
  }
});
