export const FIXED_QUEUE_PROTOCOL='opendesk.fixed-send-queue.v1';
export const FIXED_QUEUE_TOOL_ID='ai-send-queue';
export const FIXED_QUEUE_PROGRAM_ID='app.ai-send-queue';

const CHATGPT_ORIGIN='https://chatgpt.com';
const GEMINI_ORIGIN='https://gemini.google.com';
const DEEPSEEK_ORIGIN='https://chat.deepseek.com';
const geminiRoute=/^\/app(?:\/[a-z0-9_-]+)?\/?$/i;
const deepSeekRoute=/^\/a\/chat\/s\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const chatgptMatches=[CHATGPT_ORIGIN+'/*'];
const chatgptAndGeminiMatches=[...chatgptMatches,GEMINI_ORIGIN+'/*'];
const threeSiteMatches=[...chatgptAndGeminiMatches,DEEPSEEK_ORIGIN+'/a/chat/s/*'];
export const DEEPSEEK_HOME_MATCH=DEEPSEEK_ORIGIN+'/';
const threeSiteAndHomeMatches=[...threeSiteMatches,DEEPSEEK_HOME_MATCH];

// These pairs select the compiled adapter. They do not grant website access.
// Historical bytes can only select it under the original ChatGPT rules.
const reviewedChatGPTSources=new Set([
  // 0.1.28 / revision 27 shipped with the dynamic Chrome User Scripts path.
  // Preserve its exact ChatGPT-only grant when the Browser is updated.
  'db56398b3261867dd8c3ed837875e92dd05f72a455230fed336a744c401da257',
  'e40ad69c1399bf6ea331b3769a3bacc12a816140da01689456cf5a04793bff64',
  '67c29e3e47f666bc68a57a56b5c35f59cd8ca5a0c6c14f4b4b20f9f76363a6df',
  '280ef188e7f94d13f9502e7ee5d7c3cf45d39c7abae57dbc38b3bbc44c84f982',
  '2fd4ed6f63d1c09a73050733725f46e5a8419f024e48d8139cf2010fb2813126',
  '7f08a09d7022a6bd03b9b3a162b998f7f39aaa7c802208a32c99803811609591',
  '171b39b844698e8425dad470e930c3d2aa9a8ea1b438be80e891a1545e5cc6dd',
  // 0.1.38 only changes the generated header and reported Page version.
  '0f37bcf523058854b1aa040d5481606ba9e178508b6cd99295c2d86af48a82f8',
  // 0.1.39 has the same Page logic and updates only the two version strings.
  '242250dea5acb9e14c724cea17a88da704dcd0fdbe0f7820c4be51d186d0cd9e'
]);
const reviewedChatGPTAndGeminiSources=new Set([
  // 0.1.40 / revision 39
  '623651dc667e4569db07cdffe1c5effebd3544e50253b4727068b29966681863'
]);
const reviewedThreeSiteSources=new Set([
  // 0.1.41 / revision 40
  '7a005403f9a4ee9821485f496e9a489e4e67192277d34e524cc22d53c3139ebd',
  // 0.1.42 / revision 41: live DeepSeek history and toolbar boundaries.
  '80e4fca94b6b212b2eab60b3ce3f2769c659d5d6833df3a25c6170b734f4dc9d',
  // 0.1.43 / revision 42: conversation cache identity.
  'fd0260f453737cc3286b1dbff1233a9a8388dd7ae83dd6e89ec626f5f1d4ea9e',
  // 0.1.44 / revision 43: DeepSeek receipt with a detached old user prefix.
  '85da8031b08a92a91794b34f060c21435470c3aec48f939fec29e3e5c5e9d419',
  // 0.1.45 / revision 44: compact cache pause details and conditional backup.
  'b62f4a2995f3bb950fac29482ead29d5ec122e5a02b809ed0aaf0809229d5aaf',
  // 0.1.46 / revision 45: keep the Gemini queue visible when empty.
  'a1c64daa12659ca2afb1e7239e168bef46ff0b7c5fc615562f5e6f2f45306532',
  // 0.1.47 / revision 46 changes only the version in the generated Page header.
  'a7b40e2b6df03b3e663e88610389a1e0e7c44c11648b5c4134e676e13d34679b',
  // 0.1.48 / revision 47: scope Gemini queue display to the committed conversation.
  'e6b3f1e4ba9afa26e834fac61df012451e261e1d0ee7fb60c75c516ae72b4993',
  // 0.1.49 / revision 48: wait for a persisted Gemini turn before acknowledging admission.
  '01932530d552526898483fb6f71e0fbaa512035a52cc27e4f82c2e9d6280dd8f',
  // 0.1.50 / revision 49: keep verified paused Gemini rows bound to their conversation.
  'fa428ab47b5bb52f712347dd6bd10ca1716cfc16a66a242c55a9470c9cfd6d17',
  // 0.1.51 / revision 50: composer alignment and the original pause icon without a text badge.
  '7cc0ce3cc1486d1e932a61c82c656c909857108ae889942790b7d21eb339e17c',
  // 0.1.52 / revision 51: keep the Gemini crown reachable outside a crowded composer.
  '4e53791fb37087f239a16c75a34fcd5584b4befee605be9da2950aae0aa4048a',
  // 0.1.53 / revision 52: Gemini confirms paused handoff on a completed native edit.
  'fd683b8e6dadde63b0fc85c22e91295788c5c0403c5f6cd6b45dfa740ba9f604',
  // 0.1.54 / revision 53: Gemini verifies the stopped turn's native completion receipt.
  '14e6cabcca21bf916fd8e1101c7bdfd70ed97fbb3978eedb8205a86a1a1d3c0c',
  // 0.1.55 / revision 54: DeepSeek committed routes and responsive placement.
  '66a19f591ea5762c326d6be16b43c891b29d305b62ba6a792eaeb5463f76ab07'
]);

const reviewedThreeSiteAndHomeSources=new Set([
  // 0.1.56 / revision 55: the exact DeepSeek homepage only.
  'c000baafdf284696685090ff76c5b9e1fef2dfa6b08a5cc63c14f7d0d69ed3f5',
  // 0.1.57 / revision 56: preserve the native composer layout for wrapped drafts.
  'f1f2c2f5f1d63b996c53093925fb63d95541f52297b25602aba082860f91039b',
  // 0.1.58 / revision 57: sync the reviewed Page with the current queue source.
  'd1c0c4dfcf3f103f7e98391b65a1c21dc8234b5c451295c4fdc9ba2a9bebd688',
  // 0.1.59 / revision 58: all three crowns stay in the native bottom action area.
  'ecd4203daa74bbad1a2c1c730615adb4c46669ea8db5efd8fa1306595eb8c01d',
  // 0.1.60 / revision 59: freeze the current three-site composer and queue source.
  '4e86a74e19ef6c93ad46ed58f41f532badcf61e22acfa383df89663f16784922',
  // 1.0.0 / revision 60: preserve the reviewed site rules for the new package.
  '98651ca2d582881a90150ba369de28acdf9edb60d0b1bfba7ac08a43805e9d71',
  // 1.0.1 / revision 61: route an empty composer crown click to normal queue dispatch.
  '7738178bed7f4c39c87b5b23ab4a73570b52c695454cb08b09da8b33f8f131c7',
  // 1.0.2 / revision 62: native first send and exact ChatGPT conversation receipt.
  '1c3906a7b6d4259cc9cc63c16696cdfab77c15feda3cf09eecd48b5f1240730f',
  // 1.0.3 / revision 63: scope ChatGPT history and copy the current first-send error.
  '233219ec74f3bed29e4230bd3b80098866036fa3224b37e899348b6d5bec809d'
]);

export function fixedSendQueueOrigin(href){
  if(typeof href!=='string')return null;
  let url;
  try{url=new URL(href);}catch{return null;}
  if(url.username||url.password)return null;
  if(url.origin===CHATGPT_ORIGIN&&url.protocol==='https:')return CHATGPT_ORIGIN;
  if(url.origin===GEMINI_ORIGIN&&url.protocol==='https:'&&geminiRoute.test(url.pathname))return GEMINI_ORIGIN;
  if(url.origin===DEEPSEEK_ORIGIN&&url.protocol==='https:'&&
    (deepSeekRoute.test(url.pathname)||(url.pathname==='/'&&!url.search)))return DEEPSEEK_ORIGIN;
  return null;
}

function matchesFixedRules(rules,matches){
  return Array.isArray(rules?.matches)&&rules.matches.length===matches.length&&
    matches.every((match,index)=>rules.matches[index]===match)&&rules.excludeMatches?.length===0&&
    rules.allFrames===false&&rules.world==='USER_SCRIPT'&&rules.runAt==='document_idle';
}

export function usesFixedSendQueue(toolId,row){
  return toolId===FIXED_QUEUE_TOOL_ID&&row?.programId===FIXED_QUEUE_PROGRAM_ID&&
    ((reviewedChatGPTSources.has(row.sourceHash)&&matchesFixedRules(row.pageRules,chatgptMatches))||
      (reviewedChatGPTAndGeminiSources.has(row.sourceHash)&&matchesFixedRules(row.pageRules,chatgptAndGeminiMatches))||
      (reviewedThreeSiteSources.has(row.sourceHash)&&matchesFixedRules(row.pageRules,threeSiteMatches))||
      (reviewedThreeSiteAndHomeSources.has(row.sourceHash)&&matchesFixedRules(row.pageRules,threeSiteAndHomeMatches)));
}
