// Local fixture packaging only. Uses the original Task Package format and
// existing review/install path; this script does not install or run a Task.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createTaskPackage} from '../../../../src/platform/tasks/contract.js';
import {digestUtf8} from '../../../../src/platform/protocol.js';

const here=new URL('./',import.meta.url);
const sourceUtf8=await readFile(new URL('article-publish.controller.js',here),'utf8');
const manifest={
  format:'opendesk.task.v1',
  taskId:'webflow-media-png-local',
  version:'0.1.0',
  title:'WebFlow 本地 PNG 素材上传与草稿验证',
  description:'只在 localhost 本地文章测试页，读取当前扩展已保存且本次获批的 PNG assetId；校验网页真实 File 哈希后保存本地草稿，不对第三方平台发布。',
  author:'OpenDesk WebFlow',
  source:'local-developer',
  siteOrigins:['http://127.0.0.1:43111'],
  permissions:['page.automation','media.read'],
  entryFormat:'async-main',
  program:{revision:1,sourceHash:await digestUtf8(sourceUtf8)},
  deadlineMs:120000,
  paramsSchema:{
    type:'object',
    properties:{
      assetId:{type:'string',title:'可信 PNG 素材 ID',minLength:45,maxLength:60},
      verifyOnly:{type:'boolean',title:'只验证源码，不读取或上传素材',default:false}
    },
    required:['assetId'],additionalProperties:false
  }
};
const pkg=await createTaskPackage(manifest,sourceUtf8);
const destination=new URL('webflow-media-png-local.v0.1.0.opendesk-task.json',here);
await writeFile(destination,JSON.stringify(pkg,null,2)+'\n','utf8');
process.stdout.write('已生成本地候选 Task 包（仅文件，不代表已验证/安装）：'+
  fileURLToPath(destination)+'\n'+
  'source SHA-256: '+manifest.program.sourceHash+'\n'+
  'manifest SHA-256: '+pkg.manifestHash+'\n');
