import {readFileSync} from 'node:fs';

const releases=new Map([
  ['baidu.search.top3','baidu.search/releases/baidu.search.top3.v1.opendesk-task.json'],
  ['google.search.top3','google.search/releases/google.search.top3.1.0.3.opendesk-task.json'],
]);

export function readReviewedSearchTask(pin){
  const release=releases.get(pin.taskId);
  if(!release)throw Error('Missing reviewed Task fixture: '+pin.taskId);
  const task=JSON.parse(readFileSync(new URL('../../../../task-packs/'+release,import.meta.url),'utf8'));
  if(task.manifest.version!==pin.version||task.manifestHash!==pin.manifestHash||
    task.manifest.program.sourceHash!==pin.contentHash)throw Error('Fixture Task pin changed: '+pin.taskId);
  return task;
}
