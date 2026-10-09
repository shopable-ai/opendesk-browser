// Read current native browser/file-picker state. No product actions.
import {readFile,writeFile} from 'node:fs/promises';
import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const dir='docs/framework/evidence/sidebar-demo-r3-01a11fba/native-verified';
const s=JSON.parse(await readFile(dir+'/session.json')),c=await connect(s.endpoint);
try {
 const targets=(await c.send('Target.getTargets')).targetInfos;
 const catalog=targets.find(t=>t.targetId==='512F05DB20AA52BCDF6E345538BC75CC');
 if(!catalog)throw Error('Observed owned catalog disappeared');
 const sid=(await c.send('Target.attachToTarget',{targetId:catalog.targetId,flatten:true})).sessionId;
 const files=await evaluate(c,'globalThis.__r3Files||[]',sid);
 await writeFile(dir+'/real-file-change-events.json',JSON.stringify({at:new Date().toISOString(),catalog,files},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({fileEvents:files.length}));
} finally {c.close();}
