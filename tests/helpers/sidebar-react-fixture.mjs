import {readFile} from 'node:fs/promises';
import {loadSidebarReact,renderSidebarReact} from '../../scripts/preview/react-sidebar-ssr.mjs';
export {loadSidebarReact,renderSidebarReact};

// Keep metadata/resources from the real entry, replace its body with SSR from
// the real app. No captured legacy HTML or hand-authored business DOM fixtures.
export async function renderSidebarFixture(options={}){
  const [entry,markup]=await Promise.all([
    readFile(new URL('../../src/ui/sidepanel.html',import.meta.url),'utf8'),
    renderSidebarReact(options)
  ]);
  const scripts=[...entry.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map(match=>match[0]).join('');
  return entry.replace(/<body\b[^>]*>[\s\S]*?<\/body>/,
    '<body><div id="opendesk-react-app">'+markup+'</div>'+scripts+'</body>');
}
