import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {connect} from '../framework/sidebar-native-session.mjs';
const base='docs/framework/workstreams/evidence/cloud-control-r1',dirs=(await readdir(base)).filter(d=>/^native-\d+$/.test(d)).sort();
const session=JSON.parse(await readFile(resolve(base,dirs.at(-1),'launcher-cloud-r1-verified.json'),'utf8')),client=await connect(session.endpoint);
try{const t=(await client.send('Target.getTargets')).targetInfos.find(t=>t.targetId===process.argv[2]);if(!t)throw Error('Target missing');const {sessionId}=await client.send('Target.attachToTarget',{targetId:t.targetId,flatten:true});await client.send('Target.activateTarget',{targetId:t.targetId});for(const type of ['mousePressed','mouseReleased'])await client.send('Input.dispatchMouseEvent',{type,x:Number(process.argv[3]),y:Number(process.argv[4]),button:'left',clickCount:1},sessionId);console.log('Native click delivered to '+t.targetId);}finally{client.close();}
