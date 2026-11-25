import '../src/model.js';

// This is the authored FAQ library. The input box, generated answers,
// conversation history, page state, and credentials are outside this key.
const model=globalThis.OpenDeskKnowledgeAnswersModel;
export const knowledgeAnswersRecoveryData=Object.freeze({
  id:'ai-knowledge-answers',key:'library',schema:1,title:'AI 知识问答',
  validate:value=>model.library(value)
});
