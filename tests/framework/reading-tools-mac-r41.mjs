// Mac acceptance driver. CDP reads observations and sends trusted browser input;
// tool installation, grants, note writes and removal go through shipped UI.
import assert from "node:assert/strict";

import { createServer } from "node:http";

import { mkdir, readFile, writeFile } from "node:fs/promises";

import { execFileSync } from "node:child_process";

import { resolve, join } from "node:path";

import { randomUUID } from "node:crypto";

import { launchChrome } from "./k5-sdk-native-launcher.mjs";

import { connect, evaluate } from "./sidebar-native-session.mjs";

import { packageFingerprint } from "../../scripts/verify-package.mjs";

assert.equal(process.platform, "darwin", "This acceptance is specifically for Mac");

const directory = resolve(process.env.TOOL_EVIDENCE_DIR || "artifacts/reading-tools-mac-r41");

const binary = process.env.CHROME_BIN;

assert(binary, "CHROME_BIN must identify a real CFT executable");

await mkdir(directory, {
    recursive: true
});

const save = (name, data) => writeFile(join(directory, name), JSON.stringify(data, null, 2) + "\n");

const pause = ms => new Promise((r => setTimeout(r, ms)));

const tocPackage = JSON.parse(await readFile("src/sidebar-tools/reading-toc.opendesk-tool.json","utf8"));
const notesVersion = JSON.parse(await readFile("examples/sidebar-tools/quick-notes/tool.config.json","utf8")).version;

const results = [], trace = [];

let browser, cdp, extensionId, side, article, notes, origin;

async function until(probe, label) {
    let last;
    for (let i = 0; i < 80; i++) {
        try {
            const v = await probe();
            if (v) return v;
        } catch (e) {
            last = e;
        }
        await pause(100);
    }
    throw Error(label + (last ? ": " + last.message : ""));
}

async function check(id, work) {
    try {
        const observation = await work();
        results.push({
            id: id,
            status: observation?.accessOnly ? "NOT_TESTED" : "NATIVE_PASS",
            observation: observation
        });
        console.log((observation?.accessOnly ? "NOT_TESTED " : "PASS ") + id);
    } catch (e) {
        results.push({
            id: id,
            status: "FAIL",
            error: e.stack
        });
        if (side) {
            await shot(side, 'failure-'+id).catch(()=>{});
            await save('failure-'+id+'.json',await inspect(side,
              '({status:document.querySelector("#sidebar-tool-status")?.textContent,fileError:document.querySelector("#sidebar-tool-file-error")?.textContent,file:document.querySelector("#sidebar-tool-file")?.files?.[0]?.name,previewHidden:document.querySelector("#sidebar-tool-preview")?.hidden})').catch(error=>({error:error.message})));
        }
        if(notes)await save('failure-'+id+'-notes.json',await inspect(notes,
          '({status:document.querySelector("#note-status")?.textContent,text:document.querySelector("#note-text")?.value?.slice(0,160),disabled:document.querySelector("#note-text")?.disabled})').catch(error=>({error:error.message})));
        console.log("FAIL " + id + ": " + e.message);
    }
    await save("results.json", {
        results: results
    });
}

async function inspect(target, expression) {
    const rootAccess = 'document.querySelector("[data-opendesk-toc-root]").shadowRoot';
    if (!expression.includes(rootAccess)) return evaluate(cdp, expression, target.sessionId);
    await send(target, "DOM.enable");
    const tree = await send(target, "DOM.getDocument", {
        depth: -1,
        pierce: true
    });
    const host = await send(target, "DOM.querySelector", {
        nodeId: tree.root.nodeId,
        selector: "[data-opendesk-toc-root]"
    });
    const node = await send(target, "DOM.describeNode", {
        nodeId: host.nodeId,
        depth: 1,
        pierce: true
    });
    const root = node.node.shadowRoots?.[0];
    assert(root, "Closed shadow tree must exist");
    const object = await send(target, "DOM.resolveNode", {
        backendNodeId: root.backendNodeId
    });
    try {
        const result = await send(target, "Runtime.callFunctionOn", {
            objectId: object.object.objectId,
            functionDeclaration: "function(){return (" + expression.replaceAll(rootAccess, "this") + ");}",
            returnByValue: true,
            awaitPromise: true
        });
        if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    } finally {
        await send(target, "Runtime.releaseObject", {
            objectId: object.object.objectId
        });
    }
}

const send = (target, method, params = {}) => cdp.send(method, params, target?.sessionId);

async function attach(targetId) {
    const {sessionId: sessionId} = await cdp.send("Target.attachToTarget", {
        targetId: targetId,
        flatten: true
    });
    const t = {
        targetId: targetId,
        sessionId: sessionId
    };
    await send(t, "Runtime.enable");
    await send(t, "Page.enable");
    return t;
}

async function tab(url, newWindow = false) {
    return attach((await cdp.send("Target.createTarget", {
        url: url,
        newWindow: newWindow
    })).targetId);
}

async function front(t) {
    await cdp.send("Target.activateTarget", {
        targetId: t.targetId
    });
    await send(t, "Page.bringToFront");
    await pause(300);
}

async function shot(t, name) {
    const r = await send(t, "Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false
    });
    await writeFile(join(directory, name + ".png"), Buffer.from(r.data, "base64"));
}

// Expressions only locate real controls. No .click(), synthetic events or
// assignments to product DOM/storage are used to perform acceptance actions.
async function click(t, expression) {
    const pos = await until(()=>inspect(t, `(()=>{const n=${expression};if(!n||n.disabled||!n.getClientRects().length)return null;n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;const hit=n.getRootNode().elementFromPoint?.(x,y)||document.elementFromPoint(x,y);if(!n.contains(hit))return null;return {x,y};})()`),'visible enabled control '+expression);
    await send(t, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...pos,
        button: "left",
        clickCount: 1
    });
    await send(t, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...pos,
        button: "left",
        clickCount: 1
    });
    await pause(100);
}

const q = selector => "document.querySelector(" + JSON.stringify(selector) + ")";

const shadow = selector => 'document.querySelector("[data-opendesk-toc-root]").shadowRoot.querySelector(' + JSON.stringify(selector) + ")";

async function type(t, selector, value) {
    await click(t, q(selector));
    await send(t, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        modifiers: 4,
        windowsVirtualKeyCode: 65,
        commands: ['selectAll']
    });
    await send(t, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
        modifiers: 4,
        windowsVirtualKeyCode: 65
    });
    await send(t, "Input.insertText", {
        text: value
    });
}

async function fileImport(t, path) {
    await click(t, q("#sidebar-tool-import-trigger"));
    await send(t, "DOM.enable");
    const tree = await send(t, "DOM.getDocument", {
        depth: 1
    });
    const n = await send(t, "DOM.querySelector", {
        nodeId: tree.root.nodeId,
        selector: "#sidebar-tool-file"
    });
    await send(t, "DOM.setFileInputFiles", {
        nodeId: n.nodeId,
        files: [ resolve(path) ]
    });
    await until((() => inspect(t, '!document.querySelector("#sidebar-tool-preview").hidden')), "package review");
    await shot(t, "review-" + path.split("/").pop().split(".")[0]);
    await click(t, q("#sidebar-tool-install"));
}

async function storage(t) {
    return inspect(t, "chrome.storage.local.get(null)");
}

async function openTool(t, id) {
    await until((() => inspect(t, `!!document.querySelector('[data-sidebar-tool-action="open"][data-sidebar-tool-id="${id}"]')`)), "installed " + id);
    const previous = (await cdp.send("Target.getTargets")).targetInfos.map((x => x.targetId));
    await click(t, q(`[data-sidebar-tool-action="open"][data-sidebar-tool-id="${id}"]`));
    return until((async () => {
        for (const x of (await cdp.send("Target.getTargets")).targetInfos.filter((x => x.type === "iframe" && x.url.includes("/sidebar-tools/sandbox.html") && !previous.includes(x.targetId)))) {
            const child = await attach(x.targetId);
            if (await inspect(child, id === "quick-notes" ? '!!document.querySelector("#note-text")' : 'document.body.innerText.includes("CONTENTS")')) return child;
        }
    }), "sandbox " + id);
}

async function closeTool(t) {
    await click(t, q("#sidebar-tool-back"));
}

async function openPanel(newWindow = false) {
    const host = await tab("chrome-extension://" + extensionId + "/ui/tool.html?hostInstanceId=" + randomUUID(), newWindow);
    await front(host);
    await until((() => inspect(host, '!!document.querySelector("#tab-tools")')), "tool host");
    const windowId = await inspect(host, "chrome.windows.getCurrent().then(w=>w.id)");
    // The setup trigger opens Chrome's real SIDE_PANEL with a trusted gesture.
    // It is outside the product and cannot install, grant or write tool data.
        await inspect(host, `(()=>{const b=document.createElement('button');b.id='mac-acceptance-open-panel';b.textContent='Open acceptance panel';b.style.cssText='position:fixed;left:10px;top:65px;z-index:2147483647';b.addEventListener('click',e=>{window.__panelGesture=e.isTrusted;chrome.sidePanel.open({windowId:${windowId}})});document.body.append(b);})()`);
    const prior = (await cdp.send("Target.getTargets")).targetInfos.map((x => x.targetId));
    await click(host, q("#mac-acceptance-open-panel"));
    assert.equal(await inspect(host, "window.__panelGesture"), true);
    const target = await until((async () => {
        const contexts = await inspect(host, "chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");
        await save("panel-contexts.json", contexts);
        const targets = (await cdp.send("Target.getTargets")).targetInfos.filter((x => contexts.some((c => c.documentUrl === x.url))));
        return targets.find((x => !prior.includes(x.targetId))) || (targets.length === 1 ? targets[0] : null);
    }), "Side Panel CDP");
    const context = await inspect(host, `chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}).then(rows=>rows.find(x=>x.documentUrl===${JSON.stringify(target.url)}))`);
    assert(context, "Target must be actual SIDE_PANEL");
    const panel = await attach(target.targetId);
    panel.windowId = windowId;
    panel.host = host;
    await until((() => inspect(panel, '!!document.querySelector("#tab-tools")')), "panel ready");
    await click(panel, q("#tab-tools"));
    return panel;
}

async function closePanel(panel) {
    await inspect(panel.host, `chrome.sidePanel.close({windowId:${panel.windowId}}).then(()=>true)`);
    await pause(250);
}

async function connectBrowser() {
    cdp = await connect(browser.endpoint, {
        onEvent: event => {
            if (event.method === "Page.javascriptDialogOpening") {
                trace.push({
                    method: event.method,
                    params: event.params,
                    sessionId: event.sessionId
                });
                cdp.send("Page.handleJavaScriptDialog", {
                    accept: true
                }, event.sessionId).catch((e => trace.push({
                    dialogError: e.message
                })));
            }
        },
        onCommand: row => {
            if (row.method.startsWith("Input.") || row.method === "DOM.setFileInputFiles") trace.push(row);
        }
    });
    extensionId = await until((async () => {
        const t = (await cdp.send("Target.getTargets")).targetInfos.find((x => x.type === "service_worker" && /chrome-extension:\/\/[^/]+\/sw.js/.test(x.url)));
        return t?.url.split("/")[2];
    }), "extension worker");
}

const headings = Array.from({
    length: 120
}, ((_, i) => `<section style="min-height:230px"><h${i === 0 ? 1 : i % 5 + 2} id="duplicate">章节 ${i} 重复标题</h${i === 0 ? 1 : i % 5 + 2}><p>中文正文 ${i}</p></section>`)).join("");

const controls = `<button id="stream">流式生成</button><button id="regenerate">重新生成</button><button id="spa">SPA 导航</button><script>document.querySelector('#stream').onclick=()=>{let i=0;const timer=setInterval(()=>{const h=document.createElement('h2');h.textContent='流式章节 '+i;document.querySelector('article').append(h);if(++i===12)clearInterval(timer)},60)};document.querySelector('#regenerate').onclick=()=>{document.querySelector('article').innerHTML='<h1>重新生成后的回答</h1><h3>跳级章节</h3>'};document.querySelector('#spa').onclick=()=>history.pushState({},'',location.pathname+'?route=2');<\/script>`;

const articleHtml = `<!doctype html><meta charset="utf-8"><title>Mac 中文文章</title><style>body{margin:0;font:16px system-ui;background:white;color:#18202a}header{position:fixed;top:0;height:140px;width:100%;background:#dbe6fa;z-index:50}main{padding:155px 24px 600px;max-width:700px}button{padding:8px}</style><header>固定顶栏 140px</header><main>${controls}<article>${headings}</article></main>`;

const innerHtml = `<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui}.scroller{margin:60px 20px;height:520px;overflow:auto;border:2px solid}.bar{position:sticky;top:0;height:110px;background:#cedff7;z-index:5}section{min-height:260px}article{padding-bottom:500px}</style><main class="scroller"><div class="bar">容器内固定顶栏 110px</div><article>${headings}</article></main>`;

const chatHtml = `<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui;margin:0;padding:20px 20px 180px}article{min-height:700px}.composer{position:fixed;bottom:0;left:0;right:0;background:#def;height:100px;z-index:60}textarea{width:90%;height:60px}</style><main>${controls}<div data-message-author-role="assistant"><article><h1>第一回答</h1><h3>重复标题</h3></article><article><h1>同回答第二部分</h1><h6>深层章节</h6></article></div><div data-message-author-role="assistant"><article><h1>第二回答</h1><h2>重复标题</h2></article></div></main><form class="composer"><textarea id="prompt-textarea" placeholder="发送消息"></textarea></form>`;

const longChatHtml = chatHtml.replace('<h3>重复标题</h3>', headings).replace('</main>', '<button id="grow-composer">扩大输入框</button><button id="lazy">加载历史回答</button></main><script>document.querySelector("#grow-composer").onclick=()=>document.querySelector(".composer").style.height="200px";document.querySelector("#lazy").onclick=()=>{const a=document.createElement("article");a.innerHTML="<h1>历史回答</h1><h3>历史章节</h3>";document.querySelectorAll("[data-message-author-role=assistant]")[0].append(a)};<\/script>');

const server = createServer(((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(req.url.startsWith("/long-chat") ? longChatHtml : req.url.startsWith("/inner") ? innerHtml : req.url.startsWith("/chat") ? chatHtml : articleHtml);
}));

await new Promise((r => server.listen(0, "127.0.0.1", r)));

origin = "http://127.0.0.1:" + server.address().port;

try {
    browser = await launchChrome({
        root: process.cwd(),
        binary: binary,
        extension: resolve("dist/production"),
        headed: true,
        directory: directory,
        label: "reading-tools-r41",
        sameProfileRestart: true
    });
    await connectBrowser();
    await save("identity.json", {
        sourceHead: execFileSync("git", [ "rev-parse", "HEAD" ], {
            encoding: "utf8"
        }).trim(),
        browser: browser.metadata,
        version: await cdp.send("Browser.getVersion"),
        extensionId: extensionId,
        extension: resolve("dist/production"),
        manifest: JSON.parse(await readFile("dist/production/manifest.json", "utf8")),
        package: await packageFingerprint(resolve("dist/production")),
        origin: origin
    });
    article = await tab(origin + "/article");
    side = await openPanel();
    await check("official-review-no-implicit-site-grant", (async () => {
        await click(side, q("#sidebar-tool-official-install"));
        await until((() => inspect(side, '!document.querySelector("#sidebar-tool-preview").hidden')), "official review");
        const review = await inspect(side, 'document.querySelector("#sidebar-tool-preview").innerText');
        assert(review.includes("目录"));
        await shot(side, "official-capability-review");
        await click(side, q("#sidebar-tool-install"));
        await until((async () => ((await storage(side))["opendesk.sidebar-tools.installed.v1"] || []).some((x => x.id === "reading-toc"))), "official install");
        assert.equal(await inspect(article, 'document.querySelectorAll("[data-opendesk-toc-root]").length'), 0);
        return {
            review: review
        };
    }));
    await front(article);
    await check("explicit-site-approval", (async () => {
        await click(side, q('[data-sidebar-tool-action="site"][data-sidebar-tool-id="reading-toc"]'));
        await until((() => inspect(article, '!!document.querySelector("[data-opendesk-toc-root]")')), "page TOC");
        assert(trace.some((x => x.method === "Page.javascriptDialogOpening" && x.params.type === "confirm")));
        return (await storage(side))["opendesk.sidebar-tools.toc-sites.v1"];
    }));
    const cardCounts = () => inspect(article, '(()=>{const s=document.querySelector("[data-opendesk-toc-root]").shadowRoot;return {links:s.querySelectorAll(".link").length,modes:s.querySelectorAll(".mode").length,search:s.querySelectorAll("input").length};})()');
    await check("120-headings-six-ranks-duplicate-id-modes-no-scroll", (async () => {
        const before = await inspect(article, "scrollY");
        await click(article, shadow('[data-mode="full"]'));
        const counts = await cardCounts();
        assert.equal(counts.links, 120);
        assert.equal(counts.modes, 3);
        assert.equal(counts.search, 0);
        for (const mode of [ "top", "focus", "full" ]) {
            await click(article, shadow(`[data-mode="${mode}"]`));
            assert.equal(await inspect(article, "scrollY"), before);
        }
        return counts;
    }));
    await check("window-jump-fixed-header-readable", (async () => {
        await click(article, shadow(".list li:nth-child(21) button"));
        await pause(450);
        const r = await inspect(article, '(()=>{const n=document.querySelectorAll("article h1,article h2,article h3,article h4,article h5,article h6")[20],r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,visible:document.elementFromPoint(r.left+5,r.top+5)===n};})()');
        await shot(article, "window-jump");
        assert(r.top >= 140 && r.visible, JSON.stringify(r));
        return r;
    }));
    await check("scroll-highlight-after-native-wheel", (async () => {
        await send(article, "Input.dispatchMouseEvent", {
            type: "mouseWheel",
            x: 100,
            y: 300,
            deltaY: 600,
            deltaX: 0
        });
        await pause(300);
        const active = await inspect(article, 'document.querySelector("[data-opendesk-toc-root]").shadowRoot.querySelector("[aria-current]")?.textContent');
        assert(active);
        return {
            active: active,
            scrollY: await inspect(article, "scrollY")
        };
    }));
    await check("native-wheel-cancels-in-flight-navigation", async()=>{
        await front(article);
        const url=origin+"/article";
        const request=async(operation,details={})=>inspect(side,`(async()=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===${JSON.stringify(url)});const frames=await chrome.webNavigation.getAllFrames({tabId:tab.id});const frame=frames.find(f=>f.frameId===0);return chrome.tabs.sendMessage(tab.id,{protocol:'opendesk.reading-toc.v1',toolId:'reading-toc',operation:${JSON.stringify(operation)},expectedUrl:${JSON.stringify(url)},...${JSON.stringify(details)}},{frameId:0,documentId:frame.documentId});})()`);
        const item=(await request("toc.snapshot")).data.items[100];
        await send(article,"Emulation.setCPUThrottlingRate",{rate:4});
        try{
            const before=await inspect(article,"scrollY");
            const pending=request("toc.navigate",{id:item.id,sourceId:item.sourceId});
            const started=Date.now();let begun=false;
            while(Date.now()-started<400){
                if(await inspect(article,"scrollY")>before+1000){begun=true;break;}
                await pause(1);
            }
            assert(begun,"navigation must start before interruption");
            await send(article,"Input.dispatchMouseEvent",{type:"mouseWheel",x:100,y:300,deltaY:600,deltaX:0});
            const response=await pending;
            assert.equal(response.ok,false,"in-flight native wheel must cancel navigation");
            assert.match(response.error,/取消|变化/);
            const position=await inspect(article,"scrollY");await pause(400);
            assert(Math.abs((await inspect(article,"scrollY"))-position)<2,"cancelled navigation must not correct later");
            return {response,position,interruption:"trusted CDP wheel during actual native request"};
        }finally{await send(article,"Emulation.setCPUThrottlingRate",{rate:1});}
    });

    await check("same-directory-in-real-sidepanel", (async () => {
        const tool = await openTool(side, "reading-toc");
        await click(tool, q('[data-toc-mode="full"]'));
        await until((() => inspect(tool, 'document.body.innerText.includes("章节 119")')), "full snapshot");
        await shot(side, "sidepanel-directory");
        const value = await inspect(tool, "document.body.innerText");
        await closeTool(side);
        return {
            has120: value.includes("章节 119")
        };
    }));
    await check("internal-scroll-jump-readable", (async () => {
        const inner = await tab(origin + "/inner");
        await front(inner);
        await until((() => inspect(inner, '!!document.querySelector("[data-opendesk-toc-root]")')), "internal TOC");
        await click(inner, shadow('[data-mode="full"]'));
        await click(inner, shadow(".list li:nth-child(18) button"));
        await pause(450);
        const r = await inspect(inner, '(()=>{const h=document.querySelectorAll("article h1,article h2,article h3,article h4,article h5,article h6")[17],r=h.getBoundingClientRect(),bar=document.querySelector(".bar").getBoundingClientRect();return {top:r.top,barBottom:bar.bottom,visible:document.elementFromPoint(r.left+5,r.top+5)===h};})()');
        await shot(inner, "internal-jump");
        assert(r.top >= r.barBottom && r.visible, JSON.stringify(r));
        return r;
    }));
    const chat = await tab(origin + "/chat");
    await front(chat);
    await until((() => inspect(chat, '!!document.querySelector("[data-opendesk-toc-root]")')), "chat TOC");
    await check("chat-answer-isolation-and-composer-clear", (async () => {
        await click(chat, shadow('[data-mode="full"]'));
        const r = await inspect(chat, '(()=>{const s=document.querySelector("[data-opendesk-toc-root]").shadowRoot;return {sources:s.querySelector("select").options.length,links:[...s.querySelectorAll(".link")].map(x=>x.textContent)};})()');
        assert.equal(r.sources, 2);
        assert(r.links.includes("同回答第二部分"));
        assert(!r.links.includes("第二回答"));
        await send(chat, "Emulation.setDeviceMetricsOverride", {
            width: 400,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false
        });
        const bounds = await inspect(chat, '(()=>{const a=document.querySelector("[data-opendesk-toc-root]").getBoundingClientRect(),b=document.querySelector(".composer").getBoundingClientRect();return {cardBottom:a.bottom,composerTop:b.top};})()');
        await shot(chat, "chat-400-composer");
        assert(bounds.cardBottom <= bounds.composerTop, JSON.stringify(bounds));
        return {
            ...r,
            ...bounds
        };
    }));
    await check("stream-regenerate-spa", (async () => {
        await send(chat, "Emulation.clearDeviceMetricsOverride");
        await click(chat, q("#stream"));
        await until((() => inspect(chat, 'document.querySelector("[data-opendesk-toc-root]").shadowRoot.textContent.includes("流式章节 11")')), "stream update");
        await click(chat, q("#regenerate"));
        await until((() => inspect(chat, 'document.querySelector("[data-opendesk-toc-root]").shadowRoot.textContent.includes("重新生成后的回答")')), "regeneration");
        await click(chat, q("#spa"));
        await until((() => inspect(chat, 'location.search==="?route=2"&&!!document.querySelector("[data-opendesk-toc-root]")')), "SPA policy");
        return {
            url: await inspect(chat, "location.href")
        };
    }));
    await front(article);
    await check("long-conversation-active-cpu-lazy-history-and-unmount", async () => {
        const long = await tab(origin + "/long-chat");
        await front(long);
        await until(() => inspect(long, '!!document.querySelector("[data-opendesk-toc-root]")'), "long conversation TOC");
        await click(long,shadow('[data-mode="full"]'));
        const headingsCount = await inspect(long, 'document.querySelectorAll("h1,h2,h3,h4,h5,h6").length');
        assert(headingsCount >= 120);
        await send(long,"Emulation.setDeviceMetricsOverride",{width:900,height:400,deviceScaleFactor:1,mobile:false});
        await click(long,q("#grow-composer"));
        const composerResize=await until(async()=>{
            const r=await inspect(long,'(()=>{const a=document.querySelector("[data-opendesk-toc-root]").getBoundingClientRect(),b=document.querySelector(".composer").getBoundingClientRect();return {cardBottom:a.bottom,composerTop:b.top,width:innerWidth,height:innerHeight}})()');
            return r.cardBottom<=r.composerTop?r:null;
        },"medium width composer resize avoidance");
        await shot(long,"composer-900-after-resize");
        await send(long,"Emulation.clearDeviceMetricsOverride");
        await send(long, "Performance.enable");
        const metrics = async () => Object.fromEntries((await send(long, "Performance.getMetrics")).metrics.map(x => [x.name, x.value]));
        const started = Date.now(), before = await metrics();
        for(let i=0;i<30;i++){
            await send(long,"Input.dispatchMouseEvent",{type:"mouseWheel",x:100,y:300,deltaY:350,deltaX:0});
            await pause(60);
        }
        await send(long,"Input.dispatchKeyEvent",{type:"keyDown",key:"Home",code:"Home",modifiers:8,commands:["moveToBeginningOfDocument"]});
        await send(long,"Input.dispatchKeyEvent",{type:"keyUp",key:"Home",code:"Home",modifiers:8});
        await click(long,q("#stream"));
        await until(() => inspect(long,'document.querySelector("[data-opendesk-toc-root]").shadowRoot.textContent.includes("流式章节 11")'),"long stream observer");
        await click(long,q("#lazy"));
        await until(() => inspect(long,'document.querySelector("[data-opendesk-toc-root]").shadowRoot.textContent.includes("历史回答")'),"history lazy observer").catch(async error=>{await save("long-history-debug.json",await inspect(long,'(()=>{const r=document.querySelector("[data-opendesk-toc-root]").shadowRoot;return {index:r.querySelector("select").selectedIndex,options:[...r.querySelector("select").options].map(x=>x.textContent),labels:[...r.querySelectorAll(".link")].map(x=>x.textContent),headings:[...document.querySelectorAll("h1")].map(x=>x.textContent)}})()'));throw error;});
        const after = await metrics(), activeWallSeconds = (Date.now()-started)/1000;
        const toggle=q('[data-sidebar-tool-action="site"][data-sidebar-tool-id="reading-toc"]');
        await click(side,toggle);
        await until(() => inspect(long,'!document.querySelector("[data-opendesk-toc-root]")'),"long disable");
        await send(long,"HeapProfiler.collectGarbage");
        const disabledBefore=await send(long,"Memory.getDOMCounters");
        for(let i=0;i<8;i++){
            await click(side,toggle);
            await until(() => inspect(long,'!!document.querySelector("[data-opendesk-toc-root]")'),"cycle mount");
            await click(side,toggle);
            await until(() => inspect(long,'!document.querySelector("[data-opendesk-toc-root]")'),"cycle unmount");
        }
        await send(long,"HeapProfiler.collectGarbage");
        const disabledAfter=await send(long,"Memory.getDOMCounters");
        assert(disabledAfter.jsEventListeners <= disabledBefore.jsEventListeners + 2,JSON.stringify({disabledBefore,disabledAfter}));
        assert(disabledAfter.nodes <= disabledBefore.nodes + 5,JSON.stringify({disabledBefore,disabledAfter}));
        await click(side,toggle);
        await until(() => inspect(long,'!!document.querySelector("[data-opendesk-toc-root]")'),"long restore");
        await shot(long,"long-conversation-performance");
        await front(article);
        return {headings:headingsCount,composerResize,activeWallSeconds,taskSeconds:after.TaskDuration-before.TaskDuration,heapBefore:before.JSHeapUsedSize,heapAfter:after.JSHeapUsedSize,disabledBefore,disabledAfter,cycles:8};
    });

    await check("width-color-real-browser-zoom-keyboard", (async () => {
        const observations = [];
        for (const width of [ 360, 400, 600 ]) {
            await send(article, "Emulation.setDeviceMetricsOverride", {
                width: width,
                height: 800,
                deviceScaleFactor: 1,
                mobile: false
            });
            for (const color of [ "light", "dark" ]) {
                await send(article, "Emulation.setEmulatedMedia", {
                    features: [ {
                        name: "prefers-color-scheme",
                        value: color
                    } ]
                });
                const o = await inspect(article, '(()=>{const r=document.querySelector("[data-opendesk-toc-root]").getBoundingClientRect();return {width:innerWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()');
                assert(o.left >= 0 && o.right <= o.width);
                observations.push({
                    width: width,
                    color: color,
                    ...o
                });
                await shot(article, `toc-${width}-${color}`);
            }
        }
        await send(article, "Emulation.clearDeviceMetricsOverride");
        await inspect(side, `chrome.tabs.query({}).then(rows=>{const t=rows.find(x=>x.url===${JSON.stringify(origin + "/article")});return chrome.tabs.setZoom(t.id,2).then(()=>chrome.tabs.getZoom(t.id))})`).then((x => assert.equal(x, 2)));
        await shot(article, "toc-real-200-percent");
        await click(article, shadow('[data-mode="top"]'));
        await send(article, "Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9
        });
        const focus = await inspect(article, 'document.querySelector("[data-opendesk-toc-root]").shadowRoot.activeElement?.getAttribute("aria-label")');
        assert(focus);
        await inspect(side, `chrome.tabs.query({}).then(rows=>chrome.tabs.setZoom(rows.find(x=>x.url===${JSON.stringify(origin + "/article")}).id,1))`);
        return {
            observations: observations,
            keyboardFocus: focus,
            zoom: 2
        };
    }));
    await check("120-heading-idle-cpu-memory", (async () => {
        await send(article, "Performance.enable");
        const before = (await send(article, "Performance.getMetrics")).metrics;
        await pause(5e3);
        const after = (await send(article, "Performance.getMetrics")).metrics;
        const get = (rows, key) => rows.find((x => x.name === key))?.value;
        const observation = {
            intervalSeconds: 5,
            taskSeconds: get(after, "TaskDuration") - get(before, "TaskDuration"),
            heapBefore: get(before, "JSHeapUsedSize"),
            heapAfter: get(after, "JSHeapUsedSize"),
            nodesBefore: get(before, "Nodes"),
            nodesAfter: get(after, "Nodes")
        };
        assert(observation.taskSeconds < 1, JSON.stringify(observation));
        assert.equal(observation.nodesBefore, observation.nodesAfter);
        return observation;
    }));
    await check("panel-close-refresh-independent", (async () => {
        await closePanel(side);
        assert.equal(await inspect(article, 'document.querySelectorAll("[data-opendesk-toc-root]").length'), 1);
        await send(article, "Page.reload");
        await until((() => inspect(article, '!!document.querySelector("[data-opendesk-toc-root]")')), "refresh restores");
        return {
            restored: true
        };
    }));
    side = await openPanel();
    await front(article);
    const notesPackage = resolve("artifacts/sidebar-tools/quick-notes",notesVersion,"quick-notes.opendesk-tool.json");
    await check('notes-v111-update-preserves-data',async()=>{
        const legacy=join(directory,'quick-notes-v1.1.1.opendesk-tool.json');
        await writeFile(legacy,execFileSync('git',['show','649d74af:examples/sidebar-tools/quick-notes/quick-notes.opendesk-tool.json']));
        assert.equal(JSON.parse(await readFile(legacy,'utf8')).version,'1.1.1');
        await fileImport(side,legacy);let oldNotes=await openTool(side,'quick-notes');
        await type(oldNotes,'#note-text','旧版中文笔记保留');await click(oldNotes,q('#save-note'));
        await until(async()=>JSON.stringify((await storage(side))['opendesk.sidebar-tools.data.v1:quick-notes']).includes('旧版中文笔记保留'),'legacy save');
        await closeTool(side);await fileImport(side,notesPackage);
        const updated=await openTool(side,'quick-notes');
        await until(()=>inspect(updated,'document.querySelector("#note-text").value==="旧版中文笔记保留"'),'updated data');
        await shot(side,'notes-v111-updated');await closeTool(side);
        return {from:'1.1.1',to:notesVersion,dataPreserved:true};
    });
    await check("quick-notes-install-chinese-cmd-s-association", (async () => {
        if(!((await storage(side))['opendesk.sidebar-tools.installed.v1']||[]).some(row=>row.id==='quick-notes'&&row.version===notesVersion))await fileImport(side, notesPackage);
        notes = await openTool(side, "quick-notes");
        await type(notes, "#note-text", "中文笔记：真实 Mac 测试。");
        await click(notes, q("#attach-page"));
        await send(notes, "Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "s",
            code: "KeyS",
            modifiers: 4,
            windowsVirtualKeyCode: 83
        });
        await send(notes, "Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "s",
            code: "KeyS",
            modifiers: 4,
            windowsVirtualKeyCode: 83
        });
        await until((() => inspect(notes, 'document.querySelector("#note-status").textContent.includes("已保存")||document.querySelector("#note-status").textContent.includes("保存成功")')), "Cmd+S save");
        const data = (await storage(side))["opendesk.sidebar-tools.data.v1:quick-notes"];
        assert(JSON.stringify(data).includes("中文笔记"));
        assert(JSON.stringify(data).includes(origin));
        await shot(side, "notes-chinese");
        return data;
    }));
    await check("notes-multiple-edit-delete-icons-tooltip-keyboard", (async () => {
        await click(notes, q("#add-note"));
        await type(notes, "#note-text", "第二条可删除的笔记");
        await click(notes, q("#save-note"));
        await until((() => inspect(notes, 'document.querySelectorAll("#note-list button").length===2')), "two notes");
        await click(notes, q("#delete-note"));
        await until((() => inspect(notes, '!document.querySelector("#note-confirm").hidden')), "delete confirm");
        await click(notes, q("#note-confirm-accept"));
        await until((() => inspect(notes, 'document.querySelectorAll("#note-list button").length===1')), "delete stored note");
        const controls = await inspect(notes, '[...document.querySelectorAll(".icon-button")].map(x=>({title:x.title,label:x.getAttribute("aria-label"),svg:!!x.querySelector("svg")}))');
        assert(controls.every((x => x.title && x.label && x.svg)));
        await send(notes, "Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9
        });
        return controls;
    }));
    await check("notes-switch-and-panel-close-restore", (async () => {
        await closeTool(side);
        notes = await openTool(side, "quick-notes");
        assert.equal(await inspect(notes, 'document.querySelector("#note-text").value'), "中文笔记：真实 Mac 测试。");
        await closePanel(side);
        side = await openPanel();
        await front(article);
        notes = await openTool(side, "quick-notes");
        assert.equal(await inspect(notes, 'document.querySelector("#note-text").value'), "中文笔记：真实 Mac 测试。");
        return {
            restored: true
        };
    }));
    await check("notes-storage-limit-keeps-saved-value", (async () => {
        await type(notes, "#note-text", "超".repeat(3e3));
        await click(notes, q("#save-note"));
        const status = await inspect(notes, 'document.querySelector("#note-status").textContent');
        assert(status.includes("8 KiB"));
        const data = (await storage(side))["opendesk.sidebar-tools.data.v1:quick-notes"];
        assert(JSON.stringify(data).includes("中文笔记"));
        await shot(side, "notes-storage-limit");
        await type(notes, "#note-text", "中文笔记：真实 Mac 测试。");
        await click(notes, q("#save-note"));
        return {
            status: status
        };
    }));
    await check("notes-two-windows-conditional-save", (async () => {
        const side2 = await openPanel(true);
        await front(article);
        const notes2 = await openTool(side2, "quick-notes");
        await type(notes, "#note-text", "窗口一更新");
        await click(notes, q("#save-note"));
        await until(async()=>JSON.stringify((await storage(side))['opendesk.sidebar-tools.data.v1:quick-notes']).includes('窗口一更新'), "first writer");
        await type(notes2, "#note-text", "窗口二旧版本覆盖尝试");
        await click(notes2, q("#save-note"));
        await until((() => inspect(notes2, 'document.querySelector("#note-status").textContent.includes("其他窗口")')), "conditional conflict");
        const status = await inspect(notes2, 'document.querySelector("#note-status").textContent');
        const data = (await storage(side))["opendesk.sidebar-tools.data.v1:quick-notes"];
        assert(JSON.stringify(data).includes("窗口一更新"));
        assert(!JSON.stringify(data).includes("窗口二旧版本"));
        await shot(side2, "notes-window-conflict");
        await closePanel(side2);
        return {
            status: status
        };
    }));
    await check("chrome-full-restart-restores-grants-and-notes", (async () => {
        await cdp.send("Browser.close").catch((() => {}));
        cdp.close();
        await browser.restart();
        await connectBrowser();
        article = await tab(origin + "/article");
        await until((() => inspect(article, '!!document.querySelector("[data-opendesk-toc-root]")')), "browser restart TOC");
        side = await openPanel();
        await front(article);
        notes = await openTool(side, "quick-notes");
        assert.equal(await inspect(notes, 'document.querySelector("#note-text").value'), "窗口一更新");
        await shot(side, "notes-after-browser-restart");
        return browser.metadata.restartObserved;
    }));
    await check("restricted-page-error-offline-editing", (async () => {
        const restricted = await tab("chrome://extensions");
        await front(restricted);
        await click(notes, q("#refresh-page"));
        await until((() => inspect(notes, 'document.querySelector("#page-summary").textContent.includes("暂不支持")')), "restricted page");
        await shot(side, "notes-restricted-page");
        await type(notes,"访问受限时仍能保存中文");
        await send(notes,"Input.dispatchKeyEvent",{type:"keyDown",key:"s",code:"KeyS",modifiers:4,windowsVirtualKeyCode:83});
        await send(notes,"Input.dispatchKeyEvent",{type:"keyUp",key:"s",code:"KeyS",modifiers:4,windowsVirtualKeyCode:83});
        await until(async()=>((await storage(side))["opendesk.sidebar-tools.data.v1:quick-notes"]?.notes?.value?.notes||[]).some(n=>n.text==="访问受限时仍能保存中文"),"offline save on restricted page");
        await shot(notes,"notes-restricted-saved");
        return {saved:true,
            status: await inspect(notes, 'document.querySelector("#page-summary").textContent')
        };
    }));
    await closeTool(side);
    await front(article);
    await check("toc-disable-enable-removes-and-restores", (async () => {
        await click(side, q('[data-sidebar-tool-action="site"][data-sidebar-tool-id="reading-toc"]'));
        await until((() => inspect(article, '!document.querySelector("[data-opendesk-toc-root]")')), "disable cleanup");
        await click(side, q('[data-sidebar-tool-action="site"][data-sidebar-tool-id="reading-toc"]'));
        await until((() => inspect(article, '!!document.querySelector("[data-opendesk-toc-root]")')), "enable restores");
        return {
            restored: true
        };
    }));
    await check("revoke-old-site-cleanup", (async () => {
        await click(side, q('[data-sidebar-tool-action="sites"][data-sidebar-tool-id="reading-toc"]'));
        await until((() => inspect(side, '!!document.querySelector(".sidebar-tool-site-revoke")')), "site management");
        await click(side, q(".sidebar-tool-site-revoke"));
        await until((() => inspect(article, '!document.querySelector("[data-opendesk-toc-root]")')), "grant revoke");
        return (await storage(side))["opendesk.sidebar-tools.toc-sites.v1"];
    }));
    await check("toc-uninstall-file-import-core", (async () => {
        await click(side, q('[data-sidebar-tool-action="remove"][data-sidebar-tool-id="reading-toc"]'));
        await until((async () => !((await storage(side))["opendesk.sidebar-tools.installed.v1"] || []).some((x => x.id === "reading-toc"))), "uninstall");
        await fileImport(side, join("artifacts/sidebar-tools/reading-toc",tocPackage.version,"reading-toc.opendesk-tool.json"));
        await front(article);
        await click(side, q('[data-sidebar-tool-action="site"][data-sidebar-tool-id="reading-toc"]'));
        await until((() => inspect(article, '!!document.querySelector("[data-opendesk-toc-root]")')), "imported TOC");
        return {
            imported: true
        };
    }));
    await check("notes-uninstall-clears-tool-data", (async () => {
        await click(side, q('[data-sidebar-tool-action="remove"][data-sidebar-tool-id="quick-notes"]'));
        await until((async () => !((await storage(side))["opendesk.sidebar-tools.installed.v1"] || []).some((x => x.id === "quick-notes"))), "notes uninstall");
        assert.equal((await storage(side))["opendesk.sidebar-tools.data.v1:quick-notes"], undefined);
        return {
            cleared: true
        };
    }));
    for (const [id, url] of [ [ "real-chatgpt-public", "https://chatgpt.com/" ], [ "real-zhihu-public", "https://zhuanlan.zhihu.com/p/26033573" ], [ "real-technical-article", "https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts" ] ]) {
        await check(id, (async () => {
            const page = await tab(url);
            await front(page);
            await pause(6e3);
            const state = await inspect(page, '({url:location.href,title:document.title,headings:document.querySelectorAll("h1,h2,h3,h4,h5,h6").length,text:document.body?.innerText?.slice(0,800)})');
            await shot(page, id);
            await save(id + ".json", state);
            const blocked = /ERR_|无法访问|Access Denied|Just a moment|Forbidden/i.test(state.text || "") || state.url.startsWith("chrome-error:") || id==='real-chatgpt-public';
            if (blocked || state.headings < 2) {
                results.push({
                    id: id + "-functional-flows",
                    status: "NOT_TESTED",
                    reason: "Public page blocked, login required, or no authorized conversation/article flow",
                    observation: state
                });
                return {
                    accessOnly: true,
                    ...state
                };
            }
            await click(side, q('[data-sidebar-tool-action="site"][data-sidebar-tool-id="reading-toc"]'));
            await until((() => inspect(page, '!!document.querySelector("[data-opendesk-toc-root]")')), "real site TOC");
            await click(page,shadow('[data-mode="full"]'));
            const label=await inspect(page,'document.querySelector("[data-opendesk-toc-root]").shadowRoot.querySelector(".list li:nth-child(2) button").textContent.trim()');
            await click(page,shadow('.list li:nth-child(2) button'));await pause(500);
            const readable=await inspect(page,`(()=>{const h=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].find(h=>h.textContent.trim()===${JSON.stringify(label)}&&h.getClientRects().length);if(!h)return null;const range=document.createRange();range.selectNodeContents(h);const r=range.getBoundingClientRect(),y=r.top+r.height/2;return {label:h.textContent.trim(),top:r.top,bottom:r.bottom,visible:y>0&&y<innerHeight&&[r.left+3,r.left+r.width/2,r.right-3].every(x=>h.contains(document.elementFromPoint(x,y)))};})()`);
            assert(readable?.visible,JSON.stringify(readable));
            state.jump=readable;
            await shot(page, id + "-toc");
            return {
                ...state,
                toc: true
            };
        }));
    }
} catch (error) {
    results.push({
        id: "driver",
        status: "FAIL",
        error: error.stack
    });
    console.error(error);
} finally {
    await save("trusted-input-trace.json", trace);
    if (cdp) {
        await cdp.send("Browser.close").catch((() => {}));
        cdp.close();
    }
    if (browser) {
        await browser.copyLog().catch((() => {}));
        await save("cleanup.json", await browser.stop());
    }
    await new Promise((r => server.close(r)));
    await save("results.json", {
        results: results,
        counts: results.reduce(((a, x) => (a[x.status] = (a[x.status] || 0) + 1, a)), {})
    });
}

process.exitCode = results.some((x => x.status === "FAIL")) ? 1 : 0;
