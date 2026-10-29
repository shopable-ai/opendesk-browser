import {createHash} from 'node:crypto';

export const clipperStagePaths=[
  'projects/web-markdown-clipper/src/index.html',
  'projects/web-markdown-clipper/src/style.css',
  'projects/web-markdown-clipper/src/notes.js',
  'projects/web-markdown-clipper/src/main.js',
  'projects/web-markdown-clipper/preview/mock-host.js',
  'src/ui/design-tokens.css','scripts/preview/shared-tool-design.mjs'
];

// This document has no Host, Installer, network or production storage. Both
// preview entries consume the exact installed HTML/CSS/JS and this one mock.
export function generateClipperStage(sources,{compiledCss}={}){
  const read=path=>sources.get(path).toString();
  const hash=createHash('sha256');
  for(const path of clipperStagePaths)hash.update(path+'\0').update(sources.get(path)).update('\0');
  const script=code=>'<script src="data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'"></script>';
  const [html,css,notes,main,mock]=clipperStagePaths.map(read);
  if(/<\/style/i.test(compiledCss??css))throw Error('E_CLIPPER_PREVIEW_STYLE');
  return '<!doctype html><html lang="zh-CN" data-preview-instance="" data-preview-parent-origin="">'+
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data:; '+
    'style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; frame-src \'none\'; '+
    'object-src \'none\'; base-uri \'none\'; form-action \'none\'">'+
    '<meta name="od-clipper-source-sha256" content="'+hash.digest('hex')+'">'+
    '<title>网页剪藏 · 正式源码 / 模拟 Host</title><style>'+(compiledCss??css)+'</style></head><body>\n'+html+'\n'+
    script(mock)+script(notes)+script(main)+'</body></html>\n';
}
