export const STYLE = String.raw`
:host{all:initial;color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Arial,sans-serif;font-size:15px}
*{box-sizing:border-box} [hidden]{display:none!important}
.shell{--ink:#20252c;--muted:#65707e;--line:#dce1e7;--paper:#fff;--soft:#f5f6f8;--link:#285ac7;--warn:#9a5707;--code:#9a3c00;--keyword:#7048a8;--string:#216a4f;--comment:#78828d;display:flex;flex-direction:column;height:100dvh;background:var(--paper);color:var(--ink);line-height:1.65}
.shell[data-theme=dark]{--ink:#e7ebf1;--muted:#a5afbc;--line:#3c4654;--paper:#131922;--soft:#202833;--link:#9cbeff;--warn:#ffd08a;--code:#ffbf86;--keyword:#d8b4fe;--string:#95d5b2;--comment:#a5afbc;color-scheme:dark}
@media(prefers-color-scheme:dark){.shell[data-theme=auto]{--ink:#e7ebf1;--muted:#a5afbc;--line:#3c4654;--paper:#131922;--soft:#202833;--link:#9cbeff;--warn:#ffd08a;--code:#ffbf86;--keyword:#d8b4fe;--string:#95d5b2;--comment:#a5afbc;color-scheme:dark}}
.shell[data-theme=light]{color-scheme:light}
.toolbar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap;min-height:54px}
.filename{font-size:14px;min-width:100px;max-width:min(42vw,450px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.status{font-size:12px;color:var(--muted);flex:1;min-width:130px}
.status[data-error=true]{color:var(--warn)} button,select{font:inherit;font-size:12px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:7px;padding:5px 9px;cursor:pointer;white-space:nowrap;line-height:1.4}
button:hover,select:hover{background:var(--soft)}button:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid var(--link);outline-offset:2px}button[aria-pressed=true]{background:var(--soft);border-color:var(--muted)}
.controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.controls label{font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap}
.body{display:flex;min-height:0;flex:1;overflow:hidden}.toc{width:260px;flex:none;overflow:auto;padding:18px 10px 18px 12px;border-right:1px solid var(--line);font-size:13px}
.toc-title{margin:0 0 10px 8px;font-size:12px;color:var(--muted);font-weight:600}
.toc a{display:block;line-height:1.45;border-radius:6px;padding:5px 8px;overflow-wrap:anywhere;text-decoration:none;color:var(--muted);border-left:2px solid transparent}
.toc a:hover{background:var(--soft)}.toc a[aria-current=location]{color:var(--link);background:var(--soft);border-left-color:var(--link);font-weight:600}
.viewport{overflow:auto;overflow-anchor:none;min-width:0;flex:1;overscroll-behavior:contain}
.article,.raw{max-width:var(--reading-width,920px);margin:0 auto;padding:30px clamp(18px,4vw,50px) 90px;overflow-wrap:anywhere}
.article h1,.article h2,.article h3,.article h4,.article h5,.article h6{line-height:1.35;margin:1.65em 0 .6em;font-weight:650;scroll-margin-top:16px}
.article h1{font-size:2em;margin-top:0}.article h2{font-size:1.48em;border-bottom:1px solid var(--line);padding-bottom:.32em}.article h3{font-size:1.2em}
.article p,.article ul,.article ol,.article blockquote,.article pre,.article .odmv-code,.article .odmv-table{margin:0 0 1em}.article li{margin:.2em 0}.article li>ul,.article li>ol{margin-bottom:0}.article .odmv-task{list-style:none}.article input[type=checkbox]{margin:0 6px 0 0}
.article a{color:var(--link);text-decoration-thickness:1px;text-underline-offset:3px}.article img{max-width:100%;height:auto}.article hr{border:0;border-top:1px solid var(--line)}
.article blockquote{border-left:3px solid var(--line);padding:.25em 1em;color:var(--muted)}
.article code,.raw,.article pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em}.article :not(pre)>code{background:var(--soft);border-radius:4px;padding:2px 4px}
.odmv-code,.odmv-table{border:1px solid var(--line);border-radius:9px;overflow:auto}.odmv-code{background:var(--soft)}.odmv-codebar{display:flex;align-items:center;justify-content:space-between;padding:6px 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)}.odmv-code pre{margin:0;padding:14px;overflow:auto;white-space:pre;overflow-wrap:normal}.odmv-literal{white-space:pre-wrap;background:var(--soft);padding:12px}
.odmv-table table{border-collapse:collapse;width:max-content;min-width:100%;font-size:14px}.odmv-table th,.odmv-table td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:8px 12px;vertical-align:top;max-width:560px;min-width:60px}.odmv-table th{background:var(--soft);font-weight:600}.odmv-table tr:last-child td{border-bottom:0}.odmv-table td:last-child,.odmv-table th:last-child{border-right:0}
.token.keyword,.token.boolean,.token.atrule{color:var(--keyword)}.token.string,.token.attr-value{color:var(--string)}.token.comment,.token.prolog,.token.doctype{color:var(--comment)}.token.number,.token.function,.token.property,.token.tag{color:var(--code)}
.raw{white-space:pre-wrap;font-size:13px;line-height:1.7}.odmv-image-placeholder{color:var(--muted);font-size:13px}
@media(max-width:720px){.toolbar{padding:8px 10px}.filename{max-width:65vw}.status{min-width:100%;order:3}.toc{width:min(40vw,210px);padding:12px 6px}.article,.raw{padding:20px 16px 70px}}
`;
