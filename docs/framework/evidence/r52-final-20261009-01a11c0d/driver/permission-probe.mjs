import fs from 'node:fs/promises';
import {connect,evaluate} from '../../tests/framework/sidebar-native-session.mjs';
const dir='artifacts/r52-final-20261008-01a11c0d/revocation-native';
const s=JSON.parse(await fs.readFile(dir+'/session-r52.json'));
const c=await connect(s.endpoint);
try {
  const sw=(await c.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker');
  const id=(await c.send('Target.attachToTarget',{targetId:sw.targetId,flatten:true})).sessionId;
  const result=await evaluate(c,`(async()=>({observedAt:Date.now(),all:await chrome.permissions.getAll(),containsOrigin:await chrome.permissions.contains({origins:['http://127.0.0.1/*']}),containsAll:await chrome.permissions.contains({origins:['<all_urls>']}),frames:await chrome.webNavigation.getAllFrames({tabId:(await chrome.tabs.query({active:true}))[0].id})}))()`,id);
  await fs.writeFile(dir+'/permission-'+process.argv[2]+'.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {c.close()}
