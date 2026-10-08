import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {validateProgramProject} from '../../../../scripts/validate-program-project.mjs';
import {buildProgramProject} from '../../../../scripts/build-program-project.mjs';
import {validateProgramDraft} from '../../../../src/ui/program-source.js';

const evidence='docs/framework/evidence/sidebar-multifile-native-r1-20261009/current-main';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline:execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim(),programs:[]};
for(const name of ['sidebar-page-demo','sidebar-controller-demo','sidebar-assets-contract']){
  const input='examples/programs/'+name;
  const validated=await validateProgramProject(input);
  const built=await buildProgramProject(input);
  const bytes=await readFile(join(built.outputDirectory,'program.js'));
  const artifact=JSON.parse(await readFile(join(built.outputDirectory,'artifact.json'),'utf8'));
  const draftBytes=await readFile(join(built.outputDirectory,'program.opendesk-draft.json'));
  const draft=JSON.parse(draftBytes);
  await validateProgramDraft(draft);
  if(sha(bytes)!==built.sourceHash||sha(bytes)!==artifact.sourceHash||draft.sourceUtf8!==bytes.toString('utf8'))throw new Error('Frozen byte identity mismatch: '+name);
  report.programs.push({input,id:validated.id,validation:validated.status,...built,actualHash:sha(bytes),hashMatches:true,draftFileBytes:draftBytes.length,draftImportValidation:'PASS',candidateOnly:true});
}
await writeFile(join(evidence,'final-programs.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
