#!/usr/bin/env python3
"""Real-browser smoke test. Requires Python Playwright and Chromium.
Use a disposable profile and temporary Markdown files, never the user's documents.
Usage: python3 browser-smoke.py /absolute/path/to/unpacked/extension [browser executable]
"""
import base64
import json
import os
import pathlib
import re
import sys
import tempfile
import time
from playwright.sync_api import sync_playwright

dist=pathlib.Path(sys.argv[1]).resolve()
if not (dist/"manifest.json").is_file():
    raise SystemExit("Pass an actual built extension directory")
fence=chr(96)*3
source="# Local QA\n\n[Relative](./中文%20文档.markdown)\n\n![Local](./tiny.png)\n\n"
source+="| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] task\n\n"+fence+"js\nconst n = 1;\n"+fence+"\n\n"
source+="<script>document.body.dataset.executed='yes'</script>\n\n"
for i in range(1,26):
    source+=f"## Section {i}\n\n"+("A stable paragraph "+str(i)+". ")*90+"\n\n"
passed=[]
def check(id,condition):
    assert condition,id
    passed.append(id)
    print(id,"PASS",flush=True)
def wait(page,text,timeout=2000):
    page.locator(".article").get_by_text(text,exact=True).first.wait_for(timeout=timeout)
def atomic(path,content):
    tmp=path.with_suffix(".tmp")
    tmp.write_text(content,encoding="utf-8")
    os.replace(tmp,path)
with tempfile.TemporaryDirectory(prefix="odmv-") as root,sync_playwright() as pw:
    root=pathlib.Path(root)
    path=root/"QA 中文.md"
    path.write_text(source,encoding="utf-8")
    (root/"中文 文档.markdown").write_text("# Linked document\n",encoding="utf-8")
    (root/"tiny.png").write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII="))
    opts=dict(headless=False,channel="chromium",locale="en-US",args=[
        "--disable-extensions-except="+str(dist),"--load-extension="+str(dist)])
    if len(sys.argv)>2:
        opts.pop("channel")
        opts["executable_path"]=sys.argv[2]
    ctx=pw.chromium.launch_persistent_context(str(root/"profile"),**opts)
    try:
        workers=ctx.service_workers
        worker=workers[0] if workers else ctx.wait_for_event("serviceworker",timeout=15000)
        extid=worker.url.split("/")[2]
        settings=ctx.new_page()
        settings.goto("chrome-extension://"+extid+"/native-agent/settings.html")
        permission=settings.locator("#markdown-viewer-permission")
        print("File permission status:",permission.inner_text(),flush=True)
        if not worker.evaluate("new Promise(r=>chrome.extension.isAllowedFileSchemeAccess(r))"):
            print("Enable Allow access to file URLs for this unpacked extension in chrome://extensions (or edge://extensions), then press Enter.",flush=True)
            input()
        assert worker.evaluate("new Promise(r=>chrome.extension.isAllowedFileSchemeAccess(r))"),"T16 permission not enabled"
        page=ctx.new_page()
        page.goto(path.as_uri())
        wait(page,"Local QA",10000)
        check("T01/T09",page.url==path.as_uri())
        check("T10",page.locator(".article table").count()==1)
        check("T20",page.locator(".article script").count()==0 and page.locator(".article").inner_text().find("<script>")>=0 and page.evaluate("document.body.dataset.executed===undefined"))
        host=page.locator("[data-od-markdown-viewer]")
        status=page.locator(".status")
        status.locator("xpath=..").count()
        page.wait_for_function("document.querySelector('[data-od-markdown-viewer]').shadowRoot.querySelector('.status').dataset.state==='live'",timeout=10000)
        baseline=host.get_attribute("data-render-count")
        page.wait_for_timeout(2300)
        check("T04",host.get_attribute("data-render-count")==baseline)
        t=time.monotonic()
        path.write_text(source.replace("Local QA","External save"),encoding="utf-8")
        wait(page,"External save")
        elapsed=time.monotonic()-t
        check("T02",elapsed<=2.1 and page.url==path.as_uri())
        for n in range(3):
            path.write_text(source.replace("Local QA",f"Save {n}"),encoding="utf-8")
        wait(page,"Save 2",3000)
        check("T03",True)
        page.locator(".toc a").filter(has_text=re.compile("^Section 12$")).click()
        h=page.locator(".article h2").filter(has_text=re.compile("^Section 12$"))
        before=h.bounding_box()["y"]
        updated=source.replace("Local QA","Atomic update").replace("## Section 2\n\n","## Section 2\n\n"+("Inserted above. "*1200)+"\n\n")
        atomic(path,updated)
        wait(page,"Atomic update",3000)
        delta=abs(h.bounding_box()["y"]-before)
        check("T18",True)
        check("T05/T06",delta<=24)
        check("T12",page.locator(".toc a[aria-current='location']").inner_text()=="Section 12")
        page.get_by_role("button",name="Source",exact=True).click()
        check("T13","Atomic update" in page.locator(".raw").inner_text())
        page.get_by_role("button",name="Read",exact=True).click()
        page.get_by_role("checkbox",name="Live update").uncheck()
        path.write_text(source.replace("Local QA","Paused file"),encoding="utf-8")
        page.wait_for_timeout(2200)
        check("T14",page.locator(".article h1").inner_text()=="Atomic update")
        page.get_by_role("checkbox",name="Live update").check()
        wait(page,"Paused file",3000)
        check("T15",True)
        path.unlink()
        page.wait_for_function("document.querySelector('[data-od-markdown-viewer]').shadowRoot.querySelector('.status').dataset.state==='error'",timeout=9000)
        assert page.locator(".article h1").inner_text()=="Paused file"
        atomic(path,source.replace("Local QA","Recovered"))
        wait(page,"Recovered",3000)
        check("T19",True)
        check("T11-render",page.locator(".article pre code").count()>=1)
        page.locator(".article img").first.scroll_into_view_if_needed()
        page.wait_for_function("document.querySelector('[data-od-markdown-viewer]').shadowRoot.querySelector('.article img').naturalWidth>0",timeout=5000)
        check("T08",True)
        page.locator(".article a").filter(has_text=re.compile("^Relative$")).click()
        wait(page,"Linked document",10000)
        check("T07",page.url==(root/"中文 文档.markdown").as_uri())
        page2=ctx.new_page()
        page2.goto(path.as_uri())
        wait(page2,"Recovered",10000)
        page2.bring_to_front()
        (root/"中文 文档.markdown").write_text("# Background edit\n",encoding="utf-8")
        page.wait_for_timeout(1500)
        page.bring_to_front()
        wait(page,"Background edit",3000)
        check("T17",True)
        check("T21",page2.locator(".article h1").inner_text()=="Recovered")
        print(json.dumps({"passed":passed,"foregroundSeconds":elapsed,"anchorDeltaPx":delta,"remaining":["T11 clipboard contents","T16 denied then grant","T22 large document metrics","T23 disable extension and reload","Edge separate run"]},ensure_ascii=False))
    finally:
        ctx.close()
