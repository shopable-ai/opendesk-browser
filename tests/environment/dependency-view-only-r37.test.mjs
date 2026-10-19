import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPageDependencyReview} from '../../src/ui/page-dependency-review.js';
import {createPageDependencyInstaller} from '../../src/ui/page-dependency-install.js';

test('R37 absent dependency views stay inert and never inspect a legacy document',async()=>{
  const document={getElementById(){assert.fail('dependency UI must not inspect legacy HTML');}};
  for(const create of [createPageDependencyReview,createPageDependencyInstaller]){
    const ui=create({document});
    ui.update();assert.equal(ui.readyForRun,true);assert.equal(await ui.confirmRun(),true);ui.dispose();
  }
});

test('R37 dependency controllers contain only model/actions presentation',async()=>{
  for(const file of ['page-dependency-review.js','page-dependency-install.js']){
    const source=await readFile(new URL('../../src/ui/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/mountLegacy|createElement|createTextNode|replaceChildren|addEventListener|getElementById/);
  }
});
