// Optional local combination package. Keep the standalone Page identity and
// build inputs intact; never promote a bundle with unapproved vendor assets.
import {cp,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const project=fileURLToPath(new URL('../',import.meta.url));
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const local=join(project,'.opendesk-local');
const args=process.argv.slice(2);
if(args.length!==0&&(args.length!==2||args[0]!=='--out'||!args[1]))
  throw Error('Usage: build-local-sidebar.mjs [--out <candidate.opendesk-tool.json>]');
const output=args.length?resolve(args[1]):join(repo,'artifacts','sidebar-tools','ai-reply-mindmap','candidate.opendesk-tool.json');
await mkdir(local,{recursive:true});
const stage=await mkdtemp(join(local,'sidebar-'));
try{
  const config=JSON.parse(await readFile(join(project,'src/sidebar/tool.config.json'),'utf8'));
  const page=JSON.parse(await readFile(join(project,'package.json'),'utf8'));
  page.version=config.version;
  page.opendesk.id='app.'+config.id;
  await Promise.all([
    cp(join(project,'src'),join(stage,'src'),{recursive:true}),
    cp(join(project,'assets'),join(stage,'assets'),{recursive:true}),
    writeFile(join(stage,'package.json'),JSON.stringify(page)),
    writeFile(join(stage,'tool.config.json'),JSON.stringify(config))
  ]);
  execFileSync(process.execPath,[join(repo,'scripts/build-sidebar-tool.mjs'),stage,'--out',output],{cwd:repo,stdio:'inherit'});
}finally{
  await rm(stage,{recursive:true,force:true});
}
