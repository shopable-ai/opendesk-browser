import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Evaluate the real Side Panel code with load() replaced by a test-only export.
// This does not alter production code or grant the sandbox any extra permissions.
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8')
  .replace('  void load();','  globalThis.__jobAutoTest={evaluate,normalize,normalizeId,DEFAULT};');
function engine(){
  const element={addEventListener(){}};
  const context={
    OpenDeskTool:{
      root:{querySelector:()=>element,querySelectorAll:()=>[],addEventListener(){}},
      request(){throw Error('test engine must not call host services');},
      onDispose(){}
    },TextEncoder,Date
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return context.__jobAutoTest;
}
function sample(overrides={}){
  return {id:'demo12345',title:'Android 开发',company:'示例公司',salary:'20-35K',
    location:'北京',description:'Kotlin Java',descriptionScope:'card_summary',
    experience:'3-5年',education:'本科',activity:'',recruiterType:'unknown',
    contactState:'unknown',...overrides};
}
const policy={
  roles:'Android',cities:'北京',salary:25,exclude:'外包',
  skills:'Kotlin',excludeHeadhunters:true,excludeContacted:true
};
test('missing full JD or HR activity is visibly uncertain, never AI verified',()=>{
  const {evaluate}=engine();
  const result=evaluate(sample(),policy);
  assert.equal(result.rejected,false);
  assert.equal(result.needsReview,true);
  assert.ok(result.reasons.some(x=>x.includes('完整 JD 未核实')));
  assert.ok(result.reasons.some(x=>x.includes('HR 活跃度未识别')));
  assert.ok(!result.reasons.some(x=>x.includes('AI')));
});
test('fully observed, supported fields can be scored without unsupported claims',()=>{
  const {evaluate}=engine();
  const result=evaluate(sample({descriptionScope:'full_jd',activity:'刚刚活跃'}),policy);
  assert.equal(result.rejected,false);
  assert.equal(result.needsReview,false);
  assert.ok(result.score>0&&result.score<=100);
});
test('explicitly indicated headhunter and already contacted stay excluded by default',()=>{
  const {evaluate}=engine();
  assert.equal(evaluate(sample({recruiterType:'headhunter'}),policy).rejected,true);
  assert.equal(evaluate(sample({contactState:'already_contacted'}),policy).rejected,true);
  assert.equal(evaluate(sample({recruiterType:'unknown',contactState:'unknown'}),policy).rejected,false);
});
test('unreadable salary prompts review, low upper salary rejects, city mismatch rejects',()=>{
  const {evaluate}=engine();
  const unknown=evaluate(sample({salary:'面议'}),policy);
  assert.equal(unknown.rejected,false);
  assert.ok(unknown.reasons.some(x=>x.includes('薪资范围无法识别')));
  const low=evaluate(sample({salary:'12-20K'}),policy);
  assert.equal(low.rejected,true);
  assert.ok(low.reasons.some(x=>x.includes('薪资上限低于')));
  assert.equal(evaluate(sample({location:'深圳'}),policy).rejected,true);
});
test('legacy .html job IDs normalize without losing safe fields',()=>{
  const {normalize,normalizeId}=engine();
  const old=normalize(sample({id:'demo12345.html',recruiterType:'headhunter',
    contactState:'already_contacted'}));
  assert.equal(old.id,'demo12345');
  assert.equal(old.recruiterType,'headhunter');
  assert.equal(old.contactState,'already_contacted');
  assert.equal(normalizeId('bad.html'), '');
});
test('new install does not invent user skills or project experience',()=>{
  const {DEFAULT}=engine();
  assert.equal(DEFAULT.skills,'');
  assert.ok(!DEFAULT.template.includes('项目经验'));
  assert.ok(!DEFAULT.template.includes('我有'));
});
