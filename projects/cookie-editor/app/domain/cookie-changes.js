const fields=[['secure','Secure'],['httpOnly','HttpOnly'],['sameSite','SameSite'],
  ['session','会话'],['expirationDate','有效期']];
const domain=row=>row.domain.replace(/^\./,'').toLowerCase();

// Only identities and attribute names leave this function. Never retain values
// or infer a value comparison from a redacted event (including overwrite pairs).
export function cookieChanges(previous,next,events=[],revision=1,at=Date.now()){
  const before=new Map(previous.map(row=>[row.id,row]));
  const after=new Map(next.map(row=>[row.id,row]));
  const changes=[];
  for(const row of [...next,...previous.filter(row=>!after.has(row.id))]){
    const old=before.get(row.id),live=after.get(row.id);
    const kind=!old?'added':!live?'removed':'updated';
    const changed=old&&live?fields.filter(([key])=>old[key]!==live[key]).map(([,label])=>label):[];
    // The current public observer covers unpartitioned Cookies only.
    const observed=!row.partitionKey&&events.some(event=>event.name===row.name&&
      event.path===row.path&&event.domain.replace(/^\./,'').toLowerCase()===domain(row));
    if(old&&live&&!changed.length&&!observed)continue;
    changes.push({id:row.id,name:row.name,domain:row.domain,path:row.path,kind,
      fields:changed.length?changed:observed&&old&&live?['内容或属性']:[],revision,at});
  }
  return changes;
}
