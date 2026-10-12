// Local heuristic checks, not a WCAG conformance or full accessibility audit.
// No network requests or access to private form values.
export function analyzeSnapshot(snapshot) {
  if(!snapshot||snapshot.schema!=='opendesk.page-qa.snapshot.v1'||
     !snapshot.page||!Array.isArray(snapshot.elements))
    throw Error('Invalid or incompatible Page QA snapshot');
  const issues=[];
  const MAX_ISSUES=120;
  let excess=0,previousHeading=0,hasH1=false;
  const emit=(code,severity,message,element)=>{
    if(issues.length>=MAX_ISSUES){excess++;return;}
    issues.push({
      code,severity,message,
      selector:element?.selector||null,
      tag:element?.tag||null
    });
  };
  if(!snapshot.page.title.trim())
    emit('DOCUMENT_TITLE','notice','页面缺少可识别的标题。');
  if(!snapshot.page.lang.trim())
    emit('HTML_LANG','notice','html 元素未声明页面语言。');
  for(const element of snapshot.elements) {
    if(!element||typeof element.tag!=='string')continue;
    const tag=element.tag;
    if(tag==='img'&&!element.hasAlt)
      emit('IMAGE_ALT','warning','图片缺少 alt 属性；装饰性图片可以使用 alt=""。',element);
    if(tag==='button'&&!element.hasName)
      emit('BUTTON_NAME','warning','按钮缺少可识别的名称。',element);
    if(tag==='a'&&!element.hasName)
      emit('LINK_NAME','warning','链接缺少可识别的名称。',element);
    if(['input','textarea','select'].includes(tag)&&!['hidden','button','submit','reset','image'].includes(element.type)&&!element.hasLabel)
      emit('FORM_LABEL','warning','表单控件缺少关联标签或可访问名称。',element);
    if(Number.isInteger(element.headingLevel)&&element.headingLevel>=1&&element.headingLevel<=6) {
      const level=element.headingLevel;
      if(level===1)hasH1=true;
      if(previousHeading&&level>previousHeading+1)
        emit('HEADING_ORDER','notice','标题层级出现跳级，建议人工检查。',element);
      previousHeading=level;
    }
  }
  if(!hasH1&&!snapshot.truncated)
    emit('H1_MISSING','notice','页面未发现一级标题，请确认文档结构。');
  return {
    schema:'opendesk.page-qa.report.v1',
    page:{...snapshot.page},
    stats:{inspected:snapshot.inspected,truncated:Boolean(snapshot.truncated),issues:issues.length,
      warnings:issues.filter(issue=>issue.severity==='warning').length,excess},
    issues,
    sampleLocators:snapshot.elements.filter(item=>item?.selector).slice(0,6)
      .map(({selector,tag})=>({selector,tag}))
  };
}
