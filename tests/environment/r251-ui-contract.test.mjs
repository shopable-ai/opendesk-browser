import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Static palette/layout requirements only; real Chrome zoom/screenshots are separate.
const tokens=await readFile(new URL('../../src/ui/design-tokens.css',import.meta.url),'utf8');
const shell=await readFile(new URL('../../src/ui/tool-shell.css',import.meta.url),'utf8');
const system=await readFile(new URL('../../src/ui/design-system.css',import.meta.url),'utf8');
const values=Object.fromEntries([...tokens.matchAll(/(--od-[\w-]+):\s*(#[\da-fA-F]+)/g)].map(m=>[m[1],m[2]]));
function luminance(hex){
  let h=hex.slice(1);if(h.length===3)h=[...h].map(c=>c+c).join('');
  const v=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255)
    .map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*v[0]+.7152*v[1]+.0722*v[2];
}
const contrast=(a,b)=>{const [low,high]=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (high+.05)/(low+.05);};
for(const mode of ['', 'dark-']){
  test(`R25.1 ${mode||'light-'} semantic text and necessary boundaries meet AA`,()=>{
    for(const background of ['paper','bg','muted']){
      const bg=values['--od-'+mode+background];
      for(const role of ['ink','sub','positive','negative','warning']){
        const ratio=contrast(values['--od-'+mode+role],bg);
        assert.ok(ratio>=4.5,`${mode}${role}/${background}: ${ratio}`);
      }
      const accent=values['--od-'+mode+(mode?'accent-ink':'brand')];
      assert.ok(contrast(accent,bg)>=4.5,'accent text');
      assert.ok(contrast(accent,bg)>=3,'focus outline');
      assert.ok(contrast(values['--od-'+mode+'input-border'],bg)>=3,'control boundary');
    }
    assert.ok(contrast('#fff',values['--od-'+mode+'brand'])>=4.5,'primary button text');
  });
}
test('R25.1 installed and review states reuse tokens and visible focus without layout transforms',()=>{
  assert.match(system,/:focus-visible[^}]+outline:2px solid var\(--od-focus\)[^}]+outline-offset:2px/);
  assert.match(shell,/#local-install-cancel[^}]+background:var\(--od-muted\)/);
  assert.match(shell,/#local-install-warning[^}]+color:var\(--od-warning\)/);
  assert.match(shell,/#installed-page-tools-status\[data-state=error\][^}]+var\(--od-negative\)/);
  assert.match(shell,/#installed-page-tools-status\[data-state=success\][^}]+var\(--od-positive\)/);
  assert.match(shell,/.local-install-review>p[^}]+overflow-wrap:anywhere/);
  assert.match(shell,/.local-install-review>.row[^}]+flex-wrap:wrap/);
  assert.match(shell,/#installed-page-tools-list strong[^}]+overflow-wrap:anywhere/);
  assert.match(shell,/\.sidebar-tools-head strong,\.task-section-head strong\{[^}]+color:var\(--od-ink\)/);
  assert.match(shell,/\.task-card-icon\{[^}]+background:var\(--od-muted\);color:var\(--od-accent-ink\)/);
  assert.match(shell,/\.sidebar-tool-row\{[^}]+background:var\(--od-paper\)/);
  assert.match(shell,/\.sidebar-tool-item\{[^}]+color:var\(--od-ink\)/);
});
