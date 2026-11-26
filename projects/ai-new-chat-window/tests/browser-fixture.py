from pathlib import Path
from base64 import b64encode
from os import environ
from playwright.sync_api import sync_playwright, expect

# Synthetic Chromium test only; no live site navigation, no installation.
root=Path(__file__).resolve().parents[1]
def data_url(source): return 'data:text/javascript;base64,'+b64encode(source.encode()).decode()
destinations=data_url((root/'src/destinations.js').read_text())
buttons=data_url((root/'src/buttons.js').read_text().replace('./destinations.js',destinations))
html=(root/'tests/fixtures/project-hover.html').read_text().replace('../../src/buttons.js',buttons)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=environ.get('CHROMIUM_EXECUTABLE') or None)
    page=browser.new_page(viewport={'width':900,'height':750})
    errors=[]; page.on('pageerror',lambda error: errors.append(str(error)))
    page.set_content(html); page.wait_for_function('!!window.__fixture',timeout=5000)
    mark='[data-opendesk-new-chat-window]'
    project='[data-opendesk-new-chat-window="project"]'
    ordinary='[data-opendesk-new-chat-window="ordinary"]'
    def assert_count(selector,n): expect(page.locator(selector)).to_have_count(n)
    def button(row): return page.locator(row+' '+mark+' button')
    def calls(): return page.evaluate('window.__fixture.calls')
    def expected(id): return [f'https://chatgpt.com/g/g-p-{id}abf8a999a548191919851197b47446f/project','_blank','noopener,noreferrer']
    assert_count(project,3); assert_count(ordinary,1)
    for row in ['#project-row','#project-only','#project-dynamic']:
        assert_count(row+' '+mark,1); expect(button(row)).to_be_hidden()
    for row in ['#history','#history2','#unknown','#conflict','#invalid-link','#invalid-legacy']:
        assert_count(row+' '+mark,0)
    page.locator('#project-row').hover(); expect(button('#project-row')).to_be_visible()
    page.locator('#outside').hover(); expect(button('#project-row')).to_be_hidden()
    page.locator('#history').hover(); expect(button('#project-row')).to_be_hidden()
    print('PASS default/hover/leave; no history/conflict/unknown; project versus ordinary counts')
    page.locator('#project-row').hover(); button('#project-row').dblclick(); assert calls()==[expected('6')],calls()
    expect(page.locator('#draft')).to_have_value('preserved synthetic draft'); assert page.url=='about:blank'
    page.locator('#project-only').hover(); button('#project-only').click(); assert calls()==[expected('6'),expected('4')],calls()
    page.locator(ordinary+' button').click(); assert calls()[-1]==['https://chatgpt.com/','_blank','noopener,noreferrer']; assert len(calls())==3
    print('PASS real trusted mouse clicks / double click, correct two synthetic projects, ordinary, source fixture draft and URL')
    page.locator('#project-row').hover(); page.locator('#native-plus').click(); page.locator('#menu').click()
    assert page.evaluate('window.__fixture.native')==1; assert page.evaluate('window.__fixture.menu')==1
    page.locator('#global-new').click(); assert page.evaluate('window.__fixture.native')==2
    page.locator('#project-dynamic').hover(); expect(page.locator('#dynamic-plus')).to_be_visible(); assert_count('#project-dynamic '+mark,1)
    page.locator('#outside').hover(); expect(page.locator('#dynamic-plus')).to_have_count(0); assert_count('#project-dynamic '+mark,1)
    print('PASS native new/menu and dynamic native control coexist without duplicate')
    # A DOM change after pointerdown but before click: current identity read, never stale cached URL.
    page.locator('#project-only').hover(); page.evaluate("document.querySelector('#project-only').addEventListener('pointerdown',()=>document.querySelector('#project-two').setAttribute('data-sidebar-project-container-id','project:g-p-aabf8a999a548191919851197b47446f'),{once:true})")
    page.wait_for_timeout(470); button('#project-only').click(); assert calls()[-1]==expected('a'),calls()
    page.locator('#project-row').hover(); page.evaluate("document.querySelector('#project-row').addEventListener('pointerdown',()=>document.querySelector('#project-one').setAttribute('data-sidebar-project-container-id','project:g-p-babf8a999a548191919851197b47446f'),{once:true})")
    old_count=len(calls()); button('#project-row').click(); assert len(calls())==old_count
    page.wait_for_timeout(100); assert_count('#project-row '+mark,0)
    page.evaluate("document.querySelector('#project-one').setAttribute('data-sidebar-project-container-id','project:g-p-6abf8a999a548191919851197b47446f')")
    expect(page.locator('#project-row '+mark)).to_have_count(1)
    assert page.evaluate('window.__fixture.toasts.length')==1
    assert page.evaluate('window.__fixture.toasts[0].variant')=='error'
    print('PASS click-time updated ID; conflicting href prevents stale/ordinary open and requests error toast; attribute refresh')
    # Replace title row; browser observer remounts exactly once.
    page.evaluate("let row=document.querySelector('#project-only');let copy=row.cloneNode(true);copy.querySelector('[data-opendesk-new-chat-window]')?.remove();row.replaceWith(copy)")
    expect(page.locator('#project-only '+mark)).to_have_count(1)
    page.evaluate('window.__fixture.mount.refresh();window.__fixture.mount.refresh()'); assert_count(project,3)
    page.locator('#outside').hover(); page.locator('#project-only .title').focus(); page.keyboard.press('Tab'); page.keyboard.press('Tab')
    expect(button('#project-only')).to_be_focused(); page.keyboard.press('Enter'); assert calls()[-1]==expected('a')
    print('PASS SPA row replacement / repeated refresh / actual keyboard focus and Enter')
    # An explicit bad link appearing just before click must not fall back to the container ID.
    page.locator('#project-only').hover(); page.wait_for_timeout(470)
    page.evaluate("document.querySelector('#project-only').addEventListener('pointerdown',()=>{const a=document.createElement('a');a.id='late-invalid';a.hidden=true;a.href='https://example.invalid/g/g-p-malformed/project';document.querySelector('#project-only').append(a)},{once:true})")
    old_count=len(calls()); button('#project-only').click(); assert len(calls())==old_count
    assert page.evaluate('window.__fixture.toasts.length')==2
    expect(page.locator('#project-only '+mark)).to_have_count(0)
    page.evaluate("document.querySelector('#late-invalid').remove()")
    expect(page.locator('#project-only '+mark)).to_have_count(1)
    print('PASS explicit invalid href at click cannot fall back to container ID; invalid legacy row not ordinary')
    # Distinguish definite request failures from normal noopener null return.
    page.evaluate('window.__fixture.fakeWindow.open=null')
    page.locator(ordinary+' button').click(); assert len(calls())==old_count
    page.evaluate("()=>{window.__fixture.fakeWindow.open=()=>{throw new Error('synthetic open failure')}}")
    page.locator('#project-row').hover(); button('#project-row').click(); assert len(calls())==old_count
    toasts=page.evaluate('window.__fixture.toasts'); assert len(toasts)==4,toasts
    assert all(t['variant']=='error' and t['duration']==0 and t['dismissible'] and t['message'] for t in toasts),toasts
    page.evaluate('()=>{window.__fixture.fakeWindow.open=(...args)=>{window.__fixture.calls.push(args);return null}}')
    button('#project-row').click(); assert calls()[-1]==expected('6')
    assert page.evaluate('window.__fixture.toasts.length')==4
    print('PASS invalid opener and thrown error request persistent toast; noopener null not misreported')
    # Use the browser's real opener with a local blank substitute, never a live site.
    page.evaluate('()=>{window.__fixture.fakeWindow.open=(url,target,features)=>window.open("about:blank",target,features)}')
    page.wait_for_timeout(470)
    before=len(page.context.pages)
    with page.context.expect_page(timeout=5000) as pop:
        button('#project-row').dblclick()
    new_page=pop.value; new_page.wait_for_load_state(); assert len(page.context.pages)==before+1
    assert new_page.evaluate('window.opener===null'); assert page.url=='about:blank'
    expect(page.locator('#draft')).to_have_value('preserved synthetic draft')
    new_page.close()
    print('PASS real Chromium new-page event / one independent blank page / no opener; synthetic destination substitute')
    # A native main action that changes before its companion click is not a new-chat entry.
    page.evaluate("()=>{const state=window.__fixture;state.fakeWindow.location.href='https://chatgpt.com/g/g-p-6abf8a999a548191919851197b47446f/project';const main=document.createElement('main');main.id='project-main';main.innerHTML='<button aria-label=\"New chat\">New chat</button>';document.body.append(main);state.mount.refresh();main.addEventListener('pointerdown',()=>{const native=main.querySelector('button');native.setAttribute('aria-label','Other action');native.textContent='Other action'},{once:true})}")
    page.evaluate('()=>{window.__fixture.fakeWindow.open=(...args)=>{window.__fixture.calls.push(args);return null}}')
    assert_count('#project-main '+project,1)
    old_count=len(calls()); old_toasts=page.evaluate('window.__fixture.toasts.length')
    # Keep the native button geometry stable during the trusted click.
    page.locator('#project-main > button').evaluate("node=>{node.style.width='120px'}")
    button('#project-main').click(); assert len(calls())==old_count
    assert page.evaluate('window.__fixture.toasts.length')==old_toasts+1
    page.evaluate("()=>{document.querySelector('#project-main').remove();window.__fixture.fakeWindow.location.href='https://chatgpt.com/c/old-conversation';window.__fixture.mount.refresh()}")
    print('PASS stale project landing main action does not open a tab')
    # Match the real nested ChatGPT row and its right-side presentation slot.
    page.locator('#sidebar').evaluate("""nav=>{
      const project=document.createElement('div');
      const id='project:g-p-cabf8a999a548191919851197b47446f';
      project.setAttribute('data-sidebar-project-container-id',id);
      project.innerHTML='<div><div><div id="marked" class="item" role="button" tabindex="0" aria-expanded="false" data-app-action-sidebar-project-row><span class="title">Nested project</span><div><div role="presentation" style="display:flex;gap:6px"><button aria-haspopup="menu">Menu</button><button aria-label="New chat in project">+</button></div></div></div></div></div><a id="marked-history" href="/c/old">History</a>';
      const row=project.querySelector('#marked');row.setAttribute('data-app-action-sidebar-project-id',id.slice('project:'.length));
      const state=window.__fixture;state.rowActivations=0;
      row.addEventListener('click',()=>state.rowActivations++);
      row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')state.rowActivations++});
      nav.prepend(project);
    }""")
    slot='#marked [role="presentation"]'
    expect(page.locator(slot+' > '+mark)).to_have_count(1)
    expect(button('#marked')).to_be_hidden()
    page.locator('#marked').hover(); expect(button('#marked')).to_be_visible()
    assert_count(slot+' > button',2); assert_count('#marked-history '+mark,0)
    old_count=len(calls()); button('#marked').click()
    assert len(calls())==old_count+1 and calls()[-1]==expected('c')
    page.locator('#outside').hover(); page.locator('#marked').focus()
    for _ in range(3): page.keyboard.press('Tab')
    expect(button('#marked')).to_be_focused(); page.wait_for_timeout(470)
    page.keyboard.press('Space'); assert len(calls())==old_count+2 and calls()[-1]==expected('c')
    assert page.evaluate('window.__fixture.rowActivations')==0
    page.locator('#marked').evaluate("row=>row.setAttribute('data-app-action-sidebar-project-id','g-p-dabf8a999a548191919851197b47446f')")
    expect(page.locator('#marked '+mark)).to_have_count(0)
    page.locator('#marked').evaluate("row=>row.setAttribute('data-app-action-sidebar-project-id','g-p-cabf8a999a548191919851197b47446f')")
    expect(page.locator(slot+' > '+mark)).to_have_count(1)
    page.locator(slot).evaluate("slot=>{const next=slot.cloneNode(true);next.querySelector('[data-opendesk-new-chat-window]').remove();slot.replaceWith(next)}")
    expect(page.locator(slot+' > '+mark)).to_have_count(1)
    page.locator('#marked').evaluate("row=>row.closest('[data-sidebar-project-container-id]').remove()")
    print('PASS nested live-layout fixture / native slot / isolated mouse and keyboard activation / ID mismatch and slot replacement')
    page.evaluate('window.__fixture.dispose()'); assert_count(mark,0)
    page.evaluate('window.__fixture.reinstall()'); assert_count(mark,4)
    assert errors==[],errors
    print('PASS dispose/reinstall; no pageerror')
    browser.close()
