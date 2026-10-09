// ==UserScript==
// @name OpenDesk R9 jQuery page dependency check
// @match http://127.0.0.1/*
// @match https://example.com/*
// @require https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js
// @run-at document-idle
// @noframes
// ==/UserScript==

// Compatibility example: requires an existing approved jQuery dependency lock.
// A new browser profile must NOT silently approve this URL. Use a local npm
// ESM build for new dependencies; see the R9 dependency migration document.
async function main() {
  if(typeof jQuery!=='function'||jQuery.fn.jquery!=='3.7.1')
    throw new Error('E_DEPENDENCY_NOT_READY');
  const heading=jQuery('h1').first();
  if(!heading.length)throw new Error('E_EXAMPLE_HEADING_MISSING');
  heading.attr('data-opendesk-jquery','3.7.1');
  return {version:jQuery.fn.jquery,heading:heading.text(),marker:heading.attr('data-opendesk-jquery')};
}
