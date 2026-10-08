export const PROOF_ID = 'opendesk-multifile-page-proof';

export function renderProof(doc,{host,heading}) {
  let node = doc.getElementById(PROOF_ID);
  if (!node) {
    node = doc.createElement('output');
    node.id = PROOF_ID;
    node.setAttribute('role','status');
    node.setAttribute('aria-live','polite');
    node.setAttribute('data-opendesk-proof','page-esm');
    host.appendChild(node);
  }
  node.textContent = '多文件 Page 程序已运行 · ' + heading;
  return node.textContent;
}
