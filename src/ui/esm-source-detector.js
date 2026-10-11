// Sidebar's classic script editor cannot load unbuilt ESM. Keep this
// lexical admission guard independent of Node/Acorn and out of the MV3 SW.
// It is NOT an ESM parser; Node/Acorn + Webpack validate authoring projects.
export function hasUnbuiltESM(sourceUtf8) {
  const s=String(sourceUtf8),n=s.length;
  const idStart=c=>/[A-Za-z_$]/.test(c||'');
  const idRest=c=>/[\w$]/.test(c||'');
  const skipTrivia=from=>{
    let i=from;
    while(i<n){
      if(/\s/.test(s[i])){i++;continue;}
      if(s[i]==='/'&&s[i+1]==='/'){i+=2;while(i<n&&s[i]!=='\n'&&s[i]!=='\r')i++;continue;}
      if(s[i]==='/'&&s[i+1]==='*'){i+=2;while(i<n&&!(s[i]==='*'&&s[i+1]==='/'))i++;i=Math.min(n,i+2);continue;}
      break;
    }
    return i;
  };
  const quoted=(from,q)=>{
    let i=from+1;
    while(i<n){if(s[i]==='\\'){i+=2;continue;}if(s[i++]===q)break;}
    return i;
  };
  const regex=from=>{
    let i=from+1,bracket=false;
    while(i<n){
      const ch=s[i++];
      if(ch==='\\'){i++;continue;}
      if(ch==='[')bracket=true;
      else if(ch===']')bracket=false;
      else if(ch==='/'&&!bracket)break;
      if(ch==='\n'||ch==='\r')break;
    }
    while(i<n&&idRest(s[i]))i++;
    return i;
  };
  const regexAfter=new Set(['','=',':','(', '[','{',',',';','!','?','??','&&','||',
    'return','throw','case','yield','await','=>','else','do','delete','void',
    'typeof','instanceof','in','of','control-close','control-block-close','...']);
  const operatorAt=from=>s.slice(from,from+3)==='...'?'...':
    ['?.','=>','??','&&','||'].includes(s.slice(from,from+2))?s.slice(from,from+2):null;
  const methodBody=from=>{
    let i=from,depth=0,previous='';
    while(i<n){
      i=skipTrivia(i);const ch=s[i];
      if(ch==="'"||ch==='"'||ch==='`'){i=quoted(i,ch);previous='literal';continue;}
      if(ch==='/'&&s[i+1]!=='='&&regexAfter.has(previous)){i=regex(i);previous='literal';continue;}
      if(idStart(ch)){const start=i++;while(i<n&&idRest(s[i]))i++;previous=s.slice(start,i);continue;}
      const operator=operatorAt(i);
      if(operator){previous=operator;i+=operator.length;continue;}
      if(ch==='(')depth++;
      else if(ch===')'&&--depth===0)return s[skipTrivia(i+1)]==='{';
      previous=ch;i++;
    }
    return false;
  };
  const moduleKeyword=(name,from,previous,objectMethod=false)=>{
    if(previous==='.'||previous==='?.')return false;
    const i=skipTrivia(from),ch=s[i];
    if(name==='import'){
      // import() is not a safe way to bypass local dependency review either.
      if(ch==='(')return !(objectMethod&&methodBody(i));
      if(ch==='.'){
        const j=skipTrivia(i+1);
        return s.slice(j,j+4)==='meta'&&!idRest(s[j+4]);
      }
      return ch==='{'||ch==='*'||ch==="'"||ch==='"'||idStart(ch);
    }
    if(ch==='{'||ch==='*')return true;
    return /^(?:default|const|let|var|function|class|async)\b/.test(s.slice(i));
  };
  let found=false;
  function scanTemplate(from){
    let i=from+1;
    while(i<n){
      if(s[i]==='\\'){i+=2;continue;}
      if(s[i]==='\x60')return i+1;
      if(s[i]==='$'&&s[i+1]==='{'){i=scanCode(i+2,true);if(found)return i;continue;}
      i++;
    }
    return i;
  }
  function scanCode(from,interpolation=false){
    let i=from,depth=0,previous='';
    const parens=[],braces=[];
    while(i<n&&!found){
      i=skipTrivia(i);if(i>=n)break;
      const ch=s[i];
      if(ch==="'"||ch==='"'){i=quoted(i,ch);previous='literal';continue;}
      if(ch==='\x60'){i=scanTemplate(i);previous='literal';continue;}
      if(ch==='/'&&s[i+1]!=='='&&regexAfter.has(previous)){
        i=regex(i);previous='literal';continue;
      }
      if(idStart(ch)){
        const start=i++;while(i<n&&idRest(s[i]))i++;
        const token=s.slice(start,i);
        const objectMethod=braces.at(-1)==='object'&&['{',',','async','get','set'].includes(previous);
        if((token==='import'||token==='export')&&moduleKeyword(token,i,previous,objectMethod)){
          found=true;break;
        }
        previous=token;continue;
      }
      if(ch==='('){
        parens.push(['if','while','for','with','switch','catch'].includes(previous));
        previous='(';i++;continue;
      }
      if(ch===')'){previous=parens.pop()?'control-close':')';i++;continue;}
      if(ch==='{'){
        braces.push(['control-close','else','do','try','finally'].includes(previous)?'control':
          ['=','(', '[',',','return','yield','??','||','&&'].includes(previous)?'object':'block');
        depth++;previous='{';i++;continue;
      }
      if(ch==='}'){
        if(interpolation&&depth===0)return i+1;
        depth=Math.max(0,depth-1);previous=braces.pop()==='control'?'control-block-close':'}';i++;continue;
      }
      const operator=operatorAt(i);
      if(operator){previous=operator;i+=operator.length;continue;}
      previous=ch;i++;
    }
    return i;
  }
  scanCode(0);
  return found;
}
