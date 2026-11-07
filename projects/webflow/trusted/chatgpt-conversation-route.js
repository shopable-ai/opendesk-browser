// Routing only; neither an intent nor this decision grants execution rights.
// Fixed file prompts/results are not natural-language project starts, but they
// must still fence Task admission. Normalization is deny-only, never parsing or
// granting a file operation from model-controlled text.
const hasFileProtocol=text=>typeof text==='string'&&/opendesk\.(?:workspace|chatgpt)\./.test(
  text.replace(/\\u([a-f0-9]{4})/gi,(_escape,unit)=>String.fromCharCode(parseInt(unit,16))));
export const isChatGPTFileTask=text=>typeof text==='string'&&new TextEncoder().encode(text).length<=4096&&
  !/opendesk\.(?:workspace|chatgpt)\.|OpenDesk 文件请求结果/.test(text)&&
  /读取|查看|编辑|修改|替换|改为|更新|写入|\b(?:read|inspect|view|edit|update|modify|change|replace)\b/i.test(text)&&
  /\.(?:md|markdown|txt|html|htm|json|css|js|jsx|ts|tsx|mjs)(?=$|[^A-Za-z0-9])/i.test(text);

export function chatGPTConversationRoute({userText,answerText}){
  const files=isChatGPTFileTask(userText)||hasFileProtocol(userText);
  // Deny-only: quoted or malformed Task text cannot turn a file request into
  // permission, or fall back to file execution after Task validation fails.
  const text=answerText||'',pattern=/(?:opendesk\.task\.(?:intent|request)|webflow\.task\.intent)\.v1/;
  // Unicode normalization is deny-only, independent of prose quote pairing.
  // It never parses, selects or authorizes a Task or changes candidate bytes.
  const task=pattern.test(text)||pattern.test(text.replace(/\\u([a-f0-9]{4})/gi,
    (_escape,unit)=>String.fromCharCode(parseInt(unit,16))));
  return files?(task?'conflict':'files'):'task';
}

// Deny-only policy for the fixed Task consumers. The browser reader supplies
// the actual latest user text; a caller-provided task string is not evidence.
export function assertChatGPTTaskRoute({userText}){
  if(typeof userText!=='string'||!userText.trim()||new TextEncoder().encode(userText).length>4096||
    isChatGPTFileTask(userText)||hasFileProtocol(userText))
    throw {code:'E_CHAT_ROUTE',message:'无法确认唯一网页 Task 意图；文件需求与 Task 候选不能在同一轮执行',outcome:'NOT_DISPATCHED'};
}
