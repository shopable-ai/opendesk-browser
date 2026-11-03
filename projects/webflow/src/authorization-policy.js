// Web Flow's reviewed input policy. A Task Schema alone does not establish
// which inputs are safe to vary (for example recipients or payment amounts).
export function autoParameterOptions(task){
 const query=task?.paramsSchema?.properties?.query;
 if(task?.taskId!=='baidu.search.top3'||query?.type!=='string'||query.enum||
  !Number.isSafeInteger(query.maxLength)||query.maxLength<1)return null;
 return {variableKeys:['query'],label:'允许更换搜索关键词',
  description:`搜索关键词可在 ${query.minLength??0}–${query.maxLength} 字内变化；结果数量等其他参数保持本次值。`};
}
