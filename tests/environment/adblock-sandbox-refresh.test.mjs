// Runtime injection smoke test. Not a substitute for native Chrome/DNR.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import vm from 'node:vm';
import {resolve} from 'node:path';

test('installed React bundle consumes host-owned runtime and releases its React Root',async()=>{
  const pkg=await createSidebarToolPackage(resolve('examples/sidebar-tools/adblock'));
  const events={},effects=[];let created=0,disposed=0,statusReads=0;
  const target={id:'tool-app'};
  const react={
    Fragment:Symbol('Fragment'),jsx:(type,props)=>({type,props}),
    jsxs:(type,props)=>({type,props}),
    createElement:(type,props)=>({type,props}),
    useState:initial=>[initial,()=>{}],useRef:value=>({current:value}),
    useCallback:fn=>fn,useEffect:effect=>effects.push(effect),
    createRoot:node=>{
      assert.equal(node,target);created++;
      return {render(element){assert.equal(typeof element.type,'function','the compiled React entry must mount a component');element.type();
        for(const effect of effects)effect();},
        unmount(){disposed++;}};
    }
  };
  const state={installed:true,toolEnabled:true,enabled:false,exceptions:[],
    permissions:{dnr:true},rules:{verified:true,ruleIds:[]},
    currentSite:{status:'ready'},currentHost:'news.example.com'};
  const ctx={OpenDeskPageReact:react,OpenDeskSidebarUI:{Card(){},CardContent(){},Switch(){},Button(){}},
    OpenDeskTool:{root:{querySelector:selector=>selector==='#tool-app'?target:null},
      request:async operation=>{assert.equal(operation,'adblock.status');statusReads++;return state;}},
    document:{hidden:false,addEventListener(){},removeEventListener(){}},
    setInterval:()=>1,clearInterval(){},addEventListener:(name,fn)=>{events[name]=fn;},
    removeEventListener(){}};
  vm.runInNewContext(pkg.js,ctx,{timeout:1500});
  await new Promise(done=>setImmediate(done));
  assert.equal(created,1);assert.equal(statusReads,1);
  events.pagehide();events.pagehide();
  assert.equal(disposed,1,'React Root must unmount at most once');
});

test('sandbox bundle is a React product, not the former restore-only DOM script',async()=>{
  const pkg=await createSidebarToolPackage(resolve('examples/sidebar-tools/adblock'));
  assert.match(pkg.js,/\.createRoot\(/,'compiled React must use host-owned createRoot');
  assert.match(pkg.js,/E_ADBLOCK_REACT_ROOT/,'missing target must fail closed');
  assert.match(pkg.js,/adblock\.enable/);
  assert.match(pkg.js,/adblock\.disable/);
  assert.match(pkg.js,/adblock\.site\.set/);
  assert.match(pkg.js,/adblock\.site\.restore/);
  assert.doesNotMatch(pkg.js,/document\.createElement|innerHTML\s*=/);
});
