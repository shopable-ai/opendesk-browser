// R2 lightweight cross-node fixture checks only; not full JSON Schema validator or reasoning engine.
import {readFileSync} from 'node:fs';
function graphCheck(out){
 const err=[],g=out.graph,m=new Map(g.nodes.map(n=>[n.id,n])),src=new Set(out.sources.map(s=>s.id)),es=g.edges,groups=new Set(),pairs=new Set();
 if(m.size!==g.nodes.length)err.push("duplicate_node");if(src.size!==out.sources.length)err.push("duplicate_source");
 const kinds={SATISFIES:["FEATURE","REQUIREMENT"],EXERCISES:["SCENARIO","REQUIREMENT"],VERIFIED_BY:["REQUIREMENT","ACCEPTANCE"],CHECKS_SCENARIO:["ACCEPTANCE","SCENARIO"],IMPLEMENTED_BY:["FEATURE","TASK"],CONSTRAINS:["CONSTRAINT",null],OBSTRUCTS:["OBSTACLE",null],ADDRESSES:["SOLUTION",null],RESOLVES:["DECISION",null],SUPPORTED_BY:["ACCEPTANCE","EVIDENCE"]};
 for(const n of g.nodes){
  if(n.sourceIds.some(x=>!src.has(x)))err.push("missing_source:"+n.id);
  if(n.reviewState==="APPROVED"&&n.risk==="HIGH"&&n.provenance!=="USER_CONFIRMED")err.push("unapproved_high_risk:"+n.id);
  if(n.verificationState==="PASS"&&(n.type!=="ACCEPTANCE"||!es.some(e=>e.from===n.id&&e.type==="SUPPORTED_BY"&&m.get(e.to)?.type==="EVIDENCE")))err.push("unsupported_pass:"+n.id)
 }
 for(const e of es){const key=[e.from,e.type,e.to].join("|");if(pairs.has(key))err.push("duplicate_edge:"+key);pairs.add(key);if(!m.has(e.from)||!m.has(e.to)){err.push("dangling_edge:"+key);continue}if(e.from===e.to)err.push("self_edge:"+key);const k=kinds[e.type];if(k&&(m.get(e.from).type!==k[0]||(k[1]&&m.get(e.to).type!==k[1])))err.push("edge_type:"+key);if(e.type==="CONFLICTS_WITH"&&e.from>e.to)err.push("conflict_order:"+key);if(e.resolutionDecisionId&&m.get(e.resolutionDecisionId)?.type!=="DECISION")err.push("bad_resolution:"+key);if(e.type==="CONFLICTS_WITH"&&!e.resolutionDecisionId&&m.get(e.from).scope==="IN_SCOPE"&&m.get(e.to).scope==="IN_SCOPE"&&out.gate.status==="APPROVED")err.push("unresolved_conflict:"+key)}
 for(const gr of g.groups){if(groups.has(gr.id)||m.has(gr.id))err.push("duplicate_group:"+gr.id);groups.add(gr.id);if(!m.has(gr.parent)||gr.members.some(x=>!m.has(x)||x===gr.parent)||new Set(gr.members).size!==gr.members.length||gr.selected.some(x=>!gr.members.includes(x))||new Set(gr.selected).size!==gr.selected.length)err.push("bad_group:"+gr.id);if(gr.state==="RESOLVED"&&((gr.logic==="AND"&&gr.selected.length!==gr.members.length)||(gr.logic==="OR"&&!gr.selected.length)||(gr.logic==="XOR"&&gr.selected.length!==1)))err.push("group_cardinality:"+gr.id);if(gr.state==="OPEN"&&out.gate.status==="APPROVED")err.push("open_group:"+gr.id)}
 function cycle(links){const adj=new Map();for(const [a,b] of links){if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b)}const visiting=new Set(),done=new Set();function dfs(a){if(visiting.has(a))return true;if(done.has(a))return false;visiting.add(a);for(const b of adj.get(a)||[])if(dfs(b))return true;visiting.delete(a);done.add(a);return false}return [...adj.keys()].some(dfs)}
 for(const t of ["DEPENDS_ON","DERIVED_FROM"])if(cycle(es.filter(e=>e.type===t).map(e=>[e.from,e.to])))err.push("cycle:"+t);if(cycle(g.groups.flatMap(gr=>gr.members.map(x=>[gr.parent,x]))))err.push("cycle:GROUP");
 for(const n of g.nodes.filter(n=>n.type==="REQUIREMENT"&&n.scope==="IN_SCOPE"&&n.priority==="P0")){const s=es.filter(e=>e.to===n.id&&e.type==="EXERCISES").map(e=>e.from),a=es.filter(e=>e.from===n.id&&e.type==="VERIFIED_BY").map(e=>e.to);if(!s.length||!a.length||s.some(x=>!es.some(e=>a.includes(e.from)&&e.to===x&&e.type==="CHECKS_SCENARIO"))||(n.detail.requirementCategory==="FUNCTIONAL"&&!es.some(e=>e.to===n.id&&e.type==="SATISFIES"))||!es.some(e=>e.from===n.id&&e.type==="DERIVED_FROM"))err.push("missing_trace:"+n.id)}
 if(out.gate.status==="APPROVED"&&(out.stop.reason!=="FIXPOINT"||out.stop.frontier.length||out.gate.blockers.length||g.nodes.some(n=>n.scope==="IN_SCOPE"&&n.reviewState==="NEEDS_DECISION")))err.push("false_approved");
 for(const x of [...out.stop.frontier,...out.delta.added,...out.delta.changed,...out.delta.retired,...out.delta.affected])if(!m.has(x))err.push("missing_checkpoint_node:"+x);
 return err
}
function selfTest(fixtures){
 const results=fixtures.map(f=>{const errors=graphCheck(f.output);return {name:f.output.projectId+" positive",pass:!errors.length,errors}});
 const cases=[
 ["duplicate_node",x=>x.graph.nodes.push(x.graph.nodes[0])],
 ["dangling_edge",x=>x.graph.edges[0].to="MISSING"],
 ["edge_type",x=>x.graph.edges.find(e=>e.type==="SATISFIES").to="V-G"],
 ["group_cardinality",x=>x.graph.groups[0].selected=x.graph.groups[0].selected.slice(1)],
 ["group_cardinality",x=>{const g=x.graph.groups[1];g.logic="XOR";g.state="RESOLVED";g.selected=g.members}],
 ["cycle:DEPENDS_ON",x=>x.graph.edges.push({from:"V-T1",to:"V-T2",type:"DEPENDS_ON",rationale:"negative"})],
 ["cycle:DERIVED_FROM",x=>x.graph.edges.push({from:"V-I",to:"V-G",type:"DERIVED_FROM",rationale:"negative"})],
 ["missing_trace",x=>x.graph.edges=x.graph.edges.filter(e=>!(e.type==="VERIFIED_BY"&&e.from==="V-R1"))],
 ["missing_source",x=>x.graph.nodes[0].sourceIds=["MISSING"]],
 ["unsupported_pass",x=>x.graph.nodes.find(n=>n.type==="ACCEPTANCE").verificationState="PASS"],
 ["unapproved_high_risk",x=>x.graph.nodes.find(n=>n.type==="CONSTRAINT").reviewState="APPROVED"],
 ["false_approved",x=>x.gate.status="APPROVED"]];
 for(const [expect,mut] of cases){const x=JSON.parse(JSON.stringify(fixtures[0].output));mut(x);const errors=graphCheck(x);results.push({name:expect,pass:errors.some(e=>e.startsWith(expect)),errors})}return results
}
const fixtures=JSON.parse(readFileSync(new URL('./fixtures.json',import.meta.url),'utf8'));
const results=selfTest(fixtures);console.log(JSON.stringify(results,null,2));if(results.some(x=>!x.pass))process.exitCode=1;
