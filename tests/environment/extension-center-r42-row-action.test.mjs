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

test('R5.11 full row launches or opens detail; uninstall lives only in overflow',async()=>{
  const [center,react,css]=await Promise.all([
    readFile('src/ui/extension-center.js','utf8'),
    readFile('src/ui/react/tabs/tools.tsx','utf8'),
    readFile('src/ui/extension-center.css','utf8')
  ]);
  assert.match(center,/if\(resolveExtensionRowIntent\(row\)==='detail'\)\{openDetail\(key,'main'\);return;\}/);
  assert.match(center,/if\(resolveExtensionPrimaryAction\(row\)\?\.id==='open'\)/);
  assert.match(center,/sidebarTools\.openTool\(row\.id\)/);
  assert.match(center,/add\('卸载…',event=>openListUninstallReview\(row\.key,event\),'uninstall'\)/);
  assert.match(react,/className="ec-row-main" data-extension-key=\{row\.key\}/);
  assert.match(react,/data-extension-action="more"/);
  assert.doesNotMatch(react,/data-extension-action="primary"/);
  assert.doesNotMatch(react,/data-extension-action="uninstall"/);
  assert.match(css,/\.ec-row-main\{[^}]*padding:9px 10px;/);
});
test('R5.11 hover and keyboard reveal one overlay; touch retains one 44px menu',async()=>{
  const css=await readFile('src/ui/extension-center.css','utf8');
  assert.match(css,/\.ec-row\{position:relative;min-height:72px\}/);
  assert.match(css,/\.ec-row-actions\{position:absolute;[^}]*opacity:0;pointer-events:none/);
  assert.match(css,/\.ec-row--action-visible \.ec-row-actions\{opacity:1;pointer-events:auto\}/);
  assert.match(css,/@media\(hover:none\),\(pointer:coarse\)\{/);
  assert.match(css,/\.ec-row-more\{width:44px;min-width:44px;min-height:44px\}/);
  assert.match(css,/@media\(max-width:240px\)/);
  assert.match(css,/\.ec-context-menu\{position:fixed;z-index:1000/);
  assert.match(css,/#extension-center \.ec-row-main:focus-visible/);
  assert.doesNotMatch(css,/padding-right:132px|padding-right:160px/);
});

test('R5.13 last-hovered installed row retains the only desktop More affordance',async()=>{
  const [react,css]=await Promise.all([
    readFile('src/ui/react/tabs/tools.tsx','utf8'),
    readFile('src/ui/extension-center.css','utf8')
  ]);
  assert.match(react,/const \[lastInteractedKey,setLastInteractedKey\]=React\.useState\(null\)/);
  assert.match(react,/const activeActionKey=rows\.some\(row=>row\.installed&&row\.key===lastInteractedKey\)/);
  assert.match(react,/event\.pointerType!=='touch'\)setLastInteractedKey\(row\.key\)/);
  assert.match(react,/onFocusCapture=\{\(\)=>\{/);
  assert.match(react,/row\.installed&&row\.key===activeActionKey\?'ec-row ec-row--action-visible':'ec-row'/);
  assert.match(css,/\.ec-row--action-visible \.ec-row-actions\{opacity:1;pointer-events:auto\}/);
  assert.match(css,/\.ec-row--action-visible \.ec-row-main\{padding-right:52px\}/);
  assert.doesNotMatch(css,/\.ec-row:hover \.ec-row-actions|\.ec-row:focus-within \.ec-row-actions/);
  assert.match(css,/@media\(hover:none\),\(pointer:coarse\)\{/);
  assert.match(css,/\.ec-row-main,\.ec-row--action-visible \.ec-row-main\{padding-right:54px\}/);
  assert.doesNotMatch(react,/data-extension-action="uninstall"|data-extension-action="primary"/);
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
    for(const [selector,minimum] of [['.ec-row-more',3],['.ec-detail-back',4.5],['.ec-detail-actions .od-button',4.5],['.ec-glyph',3]]){
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
