// R5.8 blocked candidate: use only the existing canonical Tool packer.
// This does not install, grant Page rights, or claim live Sidebar synchronization.
import {buildSidebarTool} from '../../../../scripts/build-sidebar-tool.mjs';
import {SEND_QUEUE_PIN} from '../../../../src/platform/host/send-queue-admission.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const out='artifacts/sidebar-tools/ai-send-queue/react-candidate.opendesk-tool.json';
const result=await buildSidebarTool(root,{out});
if(result.id!=='ai-send-queue'||result.version!==SEND_QUEUE_PIN.toolVersion||result.validated!==true||
  result.installed!==false)throw Error('E_SEND_QUEUE_CANDIDATE_IDENTITY');
console.log(JSON.stringify({status:'SEND_QUEUE_REACT_CANDIDATE_ONLY',out:result.output,
  bytes:result.bytes,installed:false}));
