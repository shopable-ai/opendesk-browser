// Build-time reference adapter for R10.1. No runtime or permission changes.
// Input is already parsed JSON; raw duplicate-member detection belongs to the input parser.
export function compileParamItems(input) {
  const own=(o,k)=>Object.hasOwn(o,k);
  const plain=o=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
  const fail=(path,message)=>{throw new TypeError(`${path}: ${message}`);};
  const assert=(ok,path,message)=>{if(!ok)fail(path,message);};
  const checkKeys=(obj,allowed,required,path)=>{
    assert(plain(obj),path,"Expected JSON object");
    for(const key of Object.keys(obj))assert(allowed.includes(key),path+"."+key,"Unknown field");
    for(const key of required)assert(own(obj,key),path+"."+key,"Required declaration");
  };
  const text=(x,min,max)=>typeof x==="string"&&x.length>=min&&x.length<=max;
  const finite=x=>typeof x==="number"&&Number.isFinite(x);
  const types=["text","textarea","number","slider","checkbox","switch","select","radio","multi-checkbox","date","time","url"];
  const scalar=["string","integer","number","boolean"];
  const isValue=(type,v)=>type==="integer"?Number.isSafeInteger(v):type==="number"?finite(v):typeof v===type;
  const validValue=(type,v)=>isValue(type,v)&&(type!=="string"||[...v].length<=4096);
  checkKeys(input,["paramItemsVersion","paramItems"],["paramItemsVersion","paramItems"],"$");
  assert(input.paramItemsVersion===1,"$.paramItemsVersion","Unsupported authoring version");
  assert(Array.isArray(input.paramItems)&&input.paramItems.length<=16,"$.paramItems","Expected at most 16 fields");
  const properties={},required=[],order=[],fields={},seen=new Set();
  for(const [i,item] of input.paramItems.entries()){
    const p=`$.paramItems[${i}]`;
    assert(plain(item),p,"Expected field object");
    assert(types.includes(item.type),p+".type","Unsupported control");
    const widget=item.type;
    const numeric=widget==="number"||widget==="slider";
    const multi=widget==="multi-checkbox";
    const choice=widget==="select"||widget==="radio"||multi;
    const valueType=own(item,"valueType")?item.valueType:numeric?"integer":widget==="checkbox"||widget==="switch"?"boolean":"string";
    assert(numeric?["integer","number"].includes(valueType):choice?scalar.includes(valueType):!own(item,"valueType"),p+".valueType","Incompatible value type");
    const common=["key","label","type","required","default","description"];
    const allowed=[...common,...(multi?[]:["const"]),...(numeric||choice?["valueType"]:[]),...(choice?["options"]:[]),
      ...(numeric||choice&&!multi&&["integer","number"].includes(valueType)?["min","max","step"]:[]),
      ...(!multi&&valueType==="string"?["minLength","maxLength"]:[]),
      ...(multi?["minItems","maxItems"]:[]),
      ...(numeric?["unit"]:[]),...(["text","textarea","number","select","url"].includes(widget)?["placeholder"]:[])];
    checkKeys(item,allowed,["key","label","type",...(choice?["options"]:[])],p);
    const k=item.key;
    assert(typeof k==="string"&&/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k)&&!["constructor","prototype","__proto__"].includes(k),p+".key","Invalid parameter key");
    assert(!seen.has(k),p+".key","Duplicate parameter key");
    seen.add(k);
    assert(text(item.label,1,60)&&item.label.trim()===item.label,p+".label","Invalid label");
    if(own(item,"description"))assert(text(item.description,1,240)&&item.description.trim()===item.description,p+".description","Invalid description");
    if(own(item,"required"))assert(typeof item.required==="boolean",p+".required","Expected boolean");
    const rule={type:multi?"array":valueType,title:item.label},ui={};
    if(item.required===true)required.push(k);
    order.push(k);
    if(own(item,"description"))rule.description=item.description;
    if(widget==="date")rule.format="date";
    if(widget==="url"){rule.format="uri";rule.pattern="^https?://";}
    if(widget==="time")rule.pattern="^(?:[01][0-9]|2[0-3]):[0-5][0-9]$";
    // Explicit widgets only where needed to preserve the existing R9 fixture/mapping.
    if(["textarea","slider","switch","radio","multi-checkbox","url","time"].includes(widget))ui.widget=widget;
    if(own(item,"placeholder")){assert(text(item.placeholder,0,160),p+".placeholder","Invalid placeholder");ui.placeholder=item.placeholder;}
    if(own(item,"unit")){assert(text(item.unit,0,16),p+".unit","Invalid unit");ui.unit=item.unit;}
    for(const [short,long] of [["min","minimum"],["max","maximum"],["step","multipleOf"]]){
      if(own(item,short)){assert(finite(item[short])&&(short!=="step"||item[short]>0),p+"."+short,"Invalid numeric constraint");rule[long]=item[short];}
    }
    for(const key of ["minLength","maxLength","minItems","maxItems"]){
      if(own(item,key)){assert(Number.isSafeInteger(item[key])&&item[key]>=0&&item[key]<=(multi?32:4096),p+"."+key,"Invalid length");rule[key]=item[key];}
    }
    for(const [lo,hi] of [["minimum","maximum"],["minLength","maxLength"],["minItems","maxItems"]])if(own(rule,lo)&&own(rule,hi))assert(rule[lo]<=rule[hi],p,"Reversed bounds");
    if(widget==="slider"){
      assert(own(item,"min")&&own(item,"max")&&item.min<item.max&&own(item,"default"),p,"Slider needs min, max, default");
      if(valueType==="number")assert(own(item,"step"),p+".step","Number slider needs step");
      if(valueType==="integer")assert(!own(item,"step")||Number.isSafeInteger(item.step),p+".step","Integer slider needs integer step");
    }
    let options;
    if(choice){
      assert(Array.isArray(item.options)&&item.options.length>=1&&item.options.length<=32,p+".options","Expected 1–32 options");
      options=[];ui.optionLabels=[];
      for(const [n,opt] of item.options.entries()){
        const q=p+`.options[${n}]`;
        checkKeys(opt,["value","label"],["value","label"],q);
        assert(validValue(valueType,opt.value),q+".value","Option value has wrong type");
        assert(!options.includes(opt.value),q+".value","Duplicate option value");
        assert(text(opt.label,1,80),q+".label","Invalid option label");
        options.push(opt.value);ui.optionLabels.push(opt.label);
      }
      if(multi){rule.items={type:valueType,enum:options};rule.uniqueItems=true;}
      else rule.enum=options;
    }
    for(const key of ["const","default"]){
      if(!own(item,key))continue;
      const v=item[key];
      if(multi){
        assert(Array.isArray(v)&&v.length<=32&&v.every(x=>options.includes(x))&&new Set(v).size===v.length,p+"."+key,"Invalid choice array");
        rule[key]=[...v];
      }else{
        assert(validValue(valueType,v)&&(!options||options.includes(v)),p+"."+key,"Invalid scalar or choice");
        rule[key]=v;
      }
    }
    if(own(rule,"const")&&own(rule,"default"))assert(rule.const===rule.default,p+".default","Default differs from const");
    properties[k]=rule;
    if(Object.keys(ui).length)fields[k]=ui;
  }
  // The runtime v2 semantic validator remains authoritative. This is a source
  // projection, not a full schema/parameter validator or an execution admission.
  return {paramsSchemaVersion:2,paramsSchema:{type:"object",properties,required,additionalProperties:false},paramsUi:{version:1,order,fields}};
}
