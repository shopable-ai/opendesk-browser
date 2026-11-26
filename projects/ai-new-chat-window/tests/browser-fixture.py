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
    for row in ['#history','#history2','#unknown','#conflict']:
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
    print('PASS click-time updated ID; conflicting href prevents stale/ordinary open; attribute refresh')
    # Replace title row; browser observer remounts exactly once.
    page.evaluate("let row=document.querySelector('#project-only');let copy=row.cloneNode(true);copy.querySelector('[data-opendesk-new-chat-window]')?.remove();row.replaceWith(copy)")
    expect(page.locator('#project-only '+mark)).to_have_count(1)
    page.evaluate('window.__fixture.mount.refresh();window.__fixture.mount.refresh()'); assert_count(project,3)
    page.locator('#outside').hover(); page.locator('#project-only .title').focus(); page.keyboard.press('Tab'); page.keyboard.press('Tab')
    expect(button('#project-only')).to_be_focused(); page.keyboard.press('Enter'); assert calls()[-1]==expected('a')
    print('PASS SPA row replacement / repeated refresh / actual keyboard focus and Enter')
    page.evaluate('window.__fixture.dispose()'); assert_count(mark,0)
    page.evaluate('window.__fixture.reinstall()'); assert_count(mark,4)
    assert errors==[],errors
    print('PASS dispose/reinstall; no pageerror')
    browser.close()
