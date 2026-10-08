import {digestUtf8} from '../../src/platform/protocol.js';

export async function programDraft(runtimeKind='controller') {
  const sourceUtf8='var __opendeskProjectModule={default:async()=>42};\nasync function main(){return await __opendeskProjectModule.default();}';
  const files=[{path:'src/main.js',sourceUtf8:"import {answer} from './answer.js';\nexport default async function main(){return answer;}"},
    {path:'src/answer.js',sourceUtf8:'export const answer=42;'}];
  for(const file of files)file.sha256=await digestUtf8(file.sourceUtf8);
  return {format:'opendesk.program-draft.v1',runtimeKind,project:{id:'test-project',version:'1.0.0',entry:'src/main.js'},
    sourceUtf8,build:{mode:'development',sourceHash:await digestUtf8(sourceUtf8),byteLength:new TextEncoder().encode(sourceUtf8).length},
    authoring:{files}};
}
