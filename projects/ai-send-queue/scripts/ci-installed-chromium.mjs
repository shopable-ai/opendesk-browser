// Fail closed: the retired dual-product harness cannot verify a v2 Page module.
// Do not launch Chrome, install a second Page package, or call legacy queue RPCs.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const args=process.argv.slice(2);
const reportOnly=args.includes('--report-only');
const positional=args.filter(arg=>arg!=='--report-only');
if(positional.length>1||positional.some(arg=>arg.startsWith('--')))
  throw new Error('Usage: ci-installed-chromium.mjs [output-directory] [--report-only]');
const out=resolve(positional[0]||'artifacts/app-ci/ai-send-queue/installed');
const candidate=resolve(process.env.SEND_QUEUE_CANDIDATE_PATH||
  'artifacts/sidebar-tools/ai-send-queue/react-candidate.opendesk-tool.json');
const tool=JSON.parse(await readFile(candidate,'utf8'));
const page=tool?.pageModule;
if(tool?.format!=='opendesk.sidebar-tool.v2'||tool.id!=='ai-send-queue'||
   typeof tool.version!=='string'||!tool.version.trim()||
   page?.programId!=='app.'+tool.id||page.version!==tool.version||
   !Number.isSafeInteger(page.revision)||page.revision<=0)
  throw new Error('E_SEND_QUEUE_CANDIDATE_METADATA: expected a single v2 ai-send-queue Tool with embedded Page metadata: '+candidate);
const report={
  scope:'SEND_QUEUE_SINGLE_V2_TOOL_IMPORT',
  status:'NOT_TESTED',
  reportOnly,
  code:'E_SEND_QUEUE_LEGACY_NATIVE_TEST_UNSUPPORTED',
  message:'The dual-product native harness is unsupported for the single v2 Sidebar package. '+
    'Normal ImportSheet Page preflight, permission review and durable combo receipts require a new native test.',
  candidate,
  candidateMetadata:{
    id:tool.id,
    version:tool.version,
    pageProgramId:page.programId,
    pageVersion:page.version,
    pageInternalRevision:page.revision
  },
  browserLaunched:false,
  macChromeTested:false,
  pageInstalled:false,
  pageReadback:'NOT_TESTED',
  toolReadback:'NOT_TESTED',
  liveChatGPTSending:'NOT_TESTED',
  instructions:[
    'Import the single ai-send-queue.opendesk-tool.json via Extensions > Import local tool package (normal ImportSheet).',
    `Review Tool ${tool.version} and embedded Page ${page.programId} version ${page.version}, internal revision ${page.revision}, fixed ChatGPT scope and requested capabilities.`,
    'The embedded Page revision is internal to the parent Tool; it is not a separate Page release or installation target.',
    'Complete the existing Page preflight and trusted permission/install confirmation; never import a separate Page JSON.',
    'Read back both the exact installed Tool bytes and the matching Page Authority receipt before declaring installation successful.',
    'Open the informational Sidebar and verify the queue on a matching ChatGPT page; record reopen and revocation results separately.'
  ]
};
await mkdir(out,{recursive:true});
await writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
console.error(report.code+': '+report.message);
console.log(JSON.stringify(report,null,2));
process.exitCode=reportOnly?0:1;
