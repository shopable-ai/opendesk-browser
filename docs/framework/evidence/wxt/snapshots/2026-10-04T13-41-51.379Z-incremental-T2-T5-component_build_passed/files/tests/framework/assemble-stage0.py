"""Assemble planning evidence only; never modifies product sources or claims runtime success."""
import copy
import hashlib
import json
import pathlib
import re
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
DOC = ROOT / 'docs/framework'
STAGE = DOC / 'stage0'
OWNER = '01a0fda9-8a86-7f72-89be-e292ffc94ed4'


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical(value):
    if isinstance(value, str):
        value = re.sub(r'\bE_PERMISSION\b', 'E_PERMISSION_DENIED', value)
        return value.replace('E_EVAL_MODE_REQUIRED', 'E_LEGACY_AMBIGUOUS_EXECUTION')
    if isinstance(value, list):
        return [canonical(v) for v in value]
    if isinstance(value, dict):
        return {k:canonical(v) for k,v in value.items()}
    return value


baseline = read(STAGE / 'baseline-ledger-v1.json')
api = read(STAGE / 'api-member-draft.json')
supplement = read(STAGE / 'sdk-service-resource-draft.json')
license_evidence = read(STAGE / 'license-evidence.json')
assert supplement.get('assemblyStatus') == 'final-complete', 'SDK/service/resource author still writing'
assert len(api['apiItems']) == 48
cases = {}


def register(raw, item=None, required=True):
    c = copy.deepcopy(raw)
    case_id = c.pop('id', None) or c.pop('caseId', None)
    assert case_id and c.get('input') is not None and c.get('expected'), case_id
    for field in ['actual', 'actualResult', 'status', 'pass', 'runtimePass', 'evidence',
                  'candidatePackageSha256', 'productPackageSha256', 'prototypeCandidateSha256']:
        c.pop(field, None)
    c.update(id=case_id, required=c.get('required', required), phase=c.get('phase', 'F2/F3'),
             layer=c.get('layer', 'real Chrome/IDB product'), owner=OWNER)
    if item:
        c['capabilityIds'] = [item['id']]
        c['source'] = item['source']
    if case_id in cases:
        # Shared cases must describe the same assertion; retain all owners.
        assert cases[case_id]['input'] == c['input'] and cases[case_id]['expected'] == c['expected'], case_id
        cases[case_id]['capabilityIds'] = sorted(set(cases[case_id].get('capabilityIds', []) + c.get('capabilityIds', [])))
    else:
        cases[case_id] = c
    return case_id


def normal(raw, kind):
    x = canonical(copy.deepcopy(raw))
    s = x['source']
    s['path'] = s.get('path') or s.get('originalPath')
    s['sha256'] = s.get('sha256') or s.get('actualFileSha256') or s.get('currentSourceHash') or s.get('sourceHash')
    assert s['path'] and digest(pathlib.Path(s['path'])) == s['sha256'], x['id']
    decision = x.get('behaviorDecision') or x.get('compatibility') or x.get('decision')
    assert decision, x['id']
    scope = x.get('scope', 'core')
    if scope == 'deferred':
        scope = 'business-deferred'
    if kind == 'api':
        scope = 'core'
        if decision.get('classification') == '明确不支持':
            scope = 'restricted-contract'
        if x.get('symbol') in ['ChromePage.title', 'ChromePage.content', 'ChromePage.url']:
            decision['limitations'] = decision.get('limitations','').replace('顶层HTTP(S)文档', '明确授权绑定的HTTP(S)顶层或iframe document')
        if x.get('symbol') == 'ChromePage.reload':
            decision['corrections'] = decision.get('corrections','').replace('只刷新绑定tab', '只刷新绑定tab/frame document（子frame不刷新整个tab）')
        if x.get('symbol') in ['ChromePage.waitForSelector', 'ChromeElement.selector']:
            decision['limitations'] = decision.get('limitations','').replace('仅top-frame CSS', '仅绑定document内CSS').replace('只CSS、top frame', '只绑定document内CSS')
        if x.get('symbol') == 'ChromePage.addScriptTag':
            x['testCases'][0].update(input='addScriptTag({url:真实最终包固定允许表中的网页SDK入口})；工作台显式allowPageSdk后Hello并调用AppLocal。',
                expected='实际资源load及原SDK Promise回程后undefined；同doc重复加载不增监听；不新增测试专用产品资源。')
        if x.get('symbol') in ['ChromePage.keyboard', 'Keyboard.type', 'Keyboard.press', 'Keyboard.down', 'Keyboard.up']:
            x['completionCondition'] = 'All corrected current case assertions below on same final package; synthetic key events never imply native editing; Backspace value remains unchanged; independent acceptance.'
            if x['symbol'] == 'Keyboard.press':
                decision.update(classification='保留并限制', preserve='document上的keydown/keypress/keyup、旧默认flags、undefined；包括Backspace在内均不改变value。',
                    corrections='固定键事件命令与精确document/取消检查；不通过用户evaluate。',
                    limitations='Enter无自动提交保证；无modifier/held状态；Control+A拒绝E_KEY_UNSUPPORTED；全部isTrusted=false；旧Backspace无编辑效果保留为明确限制。')
                replacements = [
                    ('聚焦value=Base😀的input（selection在开头/中间/末尾），press Backspace/Enter；无焦点再press Backspace。', '每次document keydown/keypress/keyup，flags false，isTrusted=false，undefined；value始终Base😀；没有InputEvent或隐式提交；无焦点仍只合成document事件。'),
                    ('press空字符串/非string；撤销grant后press Backspace。', 'E_ARGUMENT_TYPE/E_PERMISSION_DENIED；预检失败零事件；已发事件不承诺撤销，取消后无后续事件。'),
                    ('press Control+A；请求Backspace删除选区；down/up Backspace。', '组合字符串E_KEY_UNSUPPORTED；Backspace三合成事件、down/up单事件；全部value不变；拒绝不算原生编辑支持。')]
                for t, (inp, exp) in zip(x['testCases'][:3], replacements):
                    t.update(input=inp, expected=exp, expectedException='见expected；边界与正常事件分账')
            elif x['symbol'] == 'ChromePage.keyboard':
                x['testCases'][2].update(input='聚焦Base😀的input，keyboard.press A和Backspace。', expected='分别只有三合成键事件，均undefined；value始终Base😀，没有native编辑。')
            elif x['symbol'] == 'Keyboard.type':
                decision['limitations'] = '只string/Unicode码点及run预算；type Backspace是逐字母事件；press Backspace也不改value；native编辑与快捷键未支持。'
                x['testCases'][2]['expected'] = '字符串Backspace逐字母事件；单独press Backspace三事件；value均不变，不算原生输入。'
            else:
                decision['limitations'] = decision.get('limitations','').replace('删除仅press("Backspace")。', 'press Backspace也不删除值。')
    modules = x.get('newModules')
    if modules is None:
        if x.get('newResponsibilities'):
            modules = [v['path'] for v in x['newResponsibilities']]
        elif isinstance(x.get('destination'), dict):
            modules = ([x['destination']['module']] if x['destination'].get('module') else []) + x['destination'].get('additionalModules', [])
        else:
            modules = []
    assignment = x.get('assignment', {})
    result = {
        'id': x['id'], 'category': x.get('category', kind), 'source': s,
        'oldBehavior': x.get('oldBehavior') or x.get('originalBehavior') or x.get('oldResourceBehavior'),
        'scope': scope, 'behaviorDecision': decision, 'newModules': modules,
        'moduleResponsibilities': x.get('newResponsibilities') or x.get('destination'),
        'productEntryChain': x.get('productEntryChain') or x.get('productCallChain') or x.get('consumer'),
        'tasks': x.get('tasks') or assignment.get('tasks') or ['T12'],
        'phase': 'F2/F3', 'dependencies': x.get('dependencies') or assignment.get('dependencies') or ['F1-approved', 'T02', 'T03', 'T04'],
        'owner': OWNER,
        'completionCondition': x.get('completionCondition') or x.get('completionConditions') or
            'All linked concrete cases on the same final product package and supported version matrix; independent acceptance. Rejection is boundary coverage, never restricted feature support.',
        'status': 'mapped', 'verificationStatus': 'not-tested', 'runtimePass': False,
        'candidateVersion': 'M5-C1',
        'implemented': False, 'integrated': False, 'productPackageSha256': None,
        'actual': None, 'evidence': [],
        'authorDetail': 'stage0/' + ('api-member-draft.json' if kind == 'api' else 'main-capability-draft.json' if kind == 'main-capability' else 'sdk-service-resource-draft.json'),
    }
    if kind == 'api':
        for f in ['symbol', 'name', 'kind', 'sourceFile', 'sourceLine', 'oldSignature', 'newSignature']:
            result[f] = x.get(f)
    for f in ['denominator', 'license', 'licenseState', 'loadContract', 'consumers', 'artifactPath', 'evidenceRefs', 'limitations']:
        if f in x:
            result[f] = x[f]
    if kind == 'resource' and scope == 'core':
        result['historicalAuthorLicense'] = result.get('license')
        result['license'] = license_evidence
        result['completionCondition'] = str(result['completionCondition']) + '; Preserve project MIT notice in both actual packages and verify exact notice bytes/hash; no vendor license inferred.'
    boundary_only = scope == 'restricted-contract' or x['id'] in ['SDK.F009.getFingerprint', 'TOOL.F017.UtilDevice.getFingerprint', 'TOOL.F017.UtilDevice.getAppIdInfo', 'SDK.F006.executeInBg_executeScript', 'SVC.F020.tokenSubstitution', 'SVC.F020.message.default']
    proposal = result.get('denominator', {})
    result['denominator'] = {'requiredContract':scope not in ['excluded','business-deferred','resource-excluded'],
        'positiveFunctionContractRequired':not boundary_only and scope not in ['excluded','business-deferred','resource-excluded'],
        'guardOnly':boundary_only, 'authorGuardOnlyProposal':proposal.get('guardOnly')}
    tests = x.get('testCases') or x.get('tests') or x.get('cases')
    assert tests, x['id']
    tests = json.loads(json.dumps(tests))
    if kind == 'api' and result.get('id') in ['API:ChromePage.keyboard', 'API:Keyboard.type']:
        for t in tests:
            if 'Backspace' in str(t.get('input', '')):
                t['expectedException'] = '见expected；Backspace仅合成document键事件，value不变、undefined；不代表native编辑。'
    if kind == 'resource' and scope == 'core':
        tests = json.loads(json.dumps(tests))
        for t in tests:
            if '移除/损坏' in str(t.get('input', '')):
                t['input'] = {'finalPackageBytesUnchanged': True, 'resourceId': x['id'], 'faults': ['fixed allowlist unknown ID', 'actual host UI revocation during native injection', 'document retirement during native load/Hello']}
                t['expected'] = 'Respectively E_RESOURCE_UNAVAILABLE, E_PERMISSION_DENIED or E_DOCUMENT_REPLACED; no false Ready, stale delivery or fallback; effects already dispatched remain separately accounted. Missing/corrupted package variants are static package-check negatives, never functional evidence for this final package.'
    result['caseIds'] = [register(t, result, scope not in ['excluded', 'business-deferred', 'resource-excluded']) for t in tests]
    return result


members = [normal(x, 'api') for x in api['apiItems']]
# Keep the original 48 identities and signatures exactly, regardless of source-declaration supplements.
assert [x['symbol'] for x in members] == [x['symbol'] for x in baseline['apiItems']]
for x, old in zip(members, baseline['apiItems']):
    assert x['sourceLine'] == old['sourceLine'] and x['oldSignature'] == old['oldSignature']
    x['historicalMapping'] = copy.deepcopy(old)
capabilities = [normal(x, 'main-capability') for x in read(STAGE / 'main-capability-draft.json')]
capabilities += [normal(x, 'capability') for x in supplement['capabilityItems']]
resources = [normal(x, 'resource') for x in supplement['resourceItems']]
items = members + capabilities + resources
assert len({x['id'] for x in items}) == len(items)

for raw in read(STAGE / 'f1-cases.json') + supplement.get('sharedMandatoryCases', []):
    register(raw)
for extra in supplement.get('closureExtras', []):
    if extra.get('case'):
        register(extra['case'])
register({'id':'CMP06-TESTMONKEY-SCOPE-BOUNDARY','phase':'stage0/F3','layer':'source/provenance and actual package closure',
          'input':'Original72 testMonkey file/class source identity and independent legacy class contract; inspect final framework package and original48 mapping.',
          'expected':'Legacy local ChromePage class remains explicitly separate and business-deferred; never alias it to original ChromePage.ts 48 or claim migrated UI. No testMonkey bundle/import/runtime consumer in final package. CMP06 full business behavior remains recorded deferred under current v5 override, not a pass claim.',
          'required':True,'scopeOverride':'Explicit current v5 testMonkey whole-business-UI deferred; preserve old CMP06 evidence and unclosed standalone semantics.'})

inherited = read(STAGE / 'inherited-contracts.json')
contracts = []
families = ['PROV01', 'PROV02', 'RESOURCE01', 'A01', 'A02', 'NAV01', 'AUTH01', 'FIX01', 'PLG01', 'SVC01', 'LEAK01', 'INT01', 'DLGEN01', 'DLGEN02']
families += [f'{p}{i:02}' for p, n in [('CMP',15), ('EX',8), ('B',5), ('CTRL',3), ('USC',6)] for i in range(1,n+1)]
for ref in inherited:
    if not ref['path'].endswith('test-spec.md'):
        continue
    text = pathlib.Path(ref['path']).read_text()
    # Keep complete source paragraphs; an expanded case cannot silently replace or weaken its parent contract.
    for block in re.split(r'\n\s*\n', text):
        if not any(re.search(r'\b' + family + r'\b', block) for family in families):
            continue
        contracts.append({'source': ref, 'text': block, 'families': [f for f in families if re.search(r'\b'+f+r'\b',block)]})

history = read(DOC / 'historical-failure-mapping.json')
historical_bindings = {x['id']:x for x in read(STAGE / 'historical-test-bindings.json')}
repairs = {
 'R1-pointer': ('Valid nested RulePlan/Command $ref plus malformed/escaped/nonexistent JSON pointers and reference cycles.', 'Valid nested refs resolve against the schema root; malformed/missing/cyclic refs reject typed E_SCHEMA before admission; never dereference undefined.'),
 'R2-unknown-properties': ('Strict object with toString/constructor/__proto__ own or inherited key and a valid allowed key.', 'Only own declared schema properties are accepted; every unknown own key rejects E_SCHEMA, prototype properties confer no authority; valid declared key succeeds.'),
 'R3-host-gone': ('Close actual host after held target slot and admitted op; reconcile with no old host present; explicit replacement host.', 'Original run interrupted/fenced; target can retire idempotently without old host; replacement needs fresh registry/epoch and explicit new run; unknown write not replayed.'),
 'R4-control-states': ('Race host-loss/reconcile with completed and stopped runs, then late stop and browser-session recovery.', 'Terminal completed/stopped state is monotonic; late stop does not overwrite completed; session recovery cannot revive old JS/run or replace confirmed control state.'),
 'R5-terminal-fence-gap': ('Kill SW between terminal commit and target/slot fence; wake and reconcile twice.', 'Terminal and fence retire atomically or through durable idempotent recovery; no forever-held slot, no new admission in the gap, repeated reconcile preserves receipts.'),
 'R6-false-completion': ('Untrusted payload naturalEnd=true with no bound target, revision or authenticated driver receipt; compare bound user return undefined/0 with no scraping rows.', 'Untrusted completion rejected; only authenticated pinned controller result can settle. A legitimately bound generic run may return undefined/0 and complete without a scraping page/seal; provenance and durable result mandatory.'),
 'R7-invalid-date-time': ('Impossible date 2025-02-30, invalid leap/time/offset, timezone-less ISO and legitimate timezone-aware leap day.', 'Invalid values reject E_SCHEMA before admission; valid timezone-aware calendar value succeeds; Date coercion alone cannot normalize impossible inputs into acceptance.'),
 'R8-journal-key-collision': ('Choose op commandId equal to a real host/grant/admission metadata key, and same commandId in two runs; actual IDB commit/restart.', 'Typed journal namespaces and immutable identity prevent overwrite; host/grant unchanged; two runs distinct; same-run exact duplicate associates original, conflict rejects. Inspect persisted keys/records after restart.')}
for h in history['R1_R8'] + history['historical17']:
    specific = repairs.get(h['id'])
    register({'id': 'REGRESSION-' + h['id'], 'phase': 'F2/F3', 'layer': 'foundation unit + actual Chrome/IDB fault barrier',
              'input': {'historicalRepro': h.get('summary') or h.get('exactHistoricalTestName'), 'tasks': h['ownerTasks'], 'source': history['source'],
                        'concreteSamples':specific[0] if specific else h['exactHistoricalTestName'], 'existingTest':historical_bindings.get(h['id'])},
              'expected': specific[1] if specific else h['exactHistoricalTestName'],
              'required': True, 'boundary': h.get('scrapingBoundary'),
              'closure': 'No skip/delete; preserve old failure; fresh output and real boundary fault proof, or an independently approved explicit replacement assertion.'})

required = [x['id'] for x in items if x['scope'] not in ['excluded', 'business-deferred', 'resource-excluded']]
restricted = [x['id'] for x in items if x['scope'] == 'restricted-contract' or x.get('denominator', {}).get('guardOnly')]
excluded = [x['id'] for x in items if x['scope'] in ['excluded', 'business-deferred', 'resource-excluded']]
denominator = {'version':1, 'candidate':'M5-C1', 'originalSourceCount':72, 'originalMemberCount':48,
               'requiredCapabilityIds': required, 'restrictedCapabilityIds':restricted, 'excludedIds':excluded,
               'reason':'Current v5 responsibility mapping; source identities fixed, restrictive assertions separate; no product success claimed',
               'changedFrom':'original72/48 design-only baseline', 'sdkServiceResourceRecommendation':supplement['scopeDenominator']}
files = copy.deepcopy(baseline['fileRows'])
dispositions = {x['id']:x for x in supplement['fileDispositions']}
for f in files:
    source_id = f['auditReference']['id']
    assert source_id in dispositions
    f['id'] = source_id
    f['historicalMapping'] = {'newPath':f.pop('newPath'), 'action':f['action'], 'status':f['status']}
    f['currentDisposition'] = dispositions[source_id]
    f['capabilityIds'] = [x['id'] for x in items if x['source']['path'] == f['originalPath']]
    f['newModules'] = sorted(set(p for x in items if x['id'] in f['capabilityIds'] for p in x['newModules']))
    f['status'] = 'mapped'
    f['runtimePass'] = False
    f['candidateVersion'] = 'M5-C1'
    children = [x for x in items if x['id'] in f['capabilityIds']]
    current = dispositions[source_id].get('currentDecision', {})
    f['source'] = {'path':f['originalPath'],'lines':f['sourceLines'],'sha256':f['sourceHash']}
    f['oldBehavior'] = f['reason']
    f['scope'] = current.get('scope', 'source-disposition')
    f['behaviorDecision'] = current
    f['productEntryChain'] = [x['productEntryChain'] for x in children] or 'No current runtime consumer; source/provenance retained, exclusion/defer never claims implementation.'
    f['owner'] = OWNER
    f['tasks'] = sorted({t for x in children for t in x['tasks']}) or ['T12']
    f['phase'] = 'stage0/F2/F3 disposition; functional progress belongs to child capabilities'
    f['dependencies'] = ['stage0-same-candidate-approval', 'T12-final-package-closure']
    case = register({'id':'PROV-DISPOSITION-'+source_id,'input':{'source':f['source'],'requiredChildren':f['capabilityIds'],'plannedModules':f['newModules'],'currentDisposition':current},
                     'expected':'Original source identity/hash preserved; each claimed child independently connected and accepted; final package contains only allowed current consumers/modules; excluded/deferred source bytes and old runtime tree absent; no whole-file success from partial child.',
                     'required':True,'layer':'source/actual package closure, separate from functional success','phase':'stage0/F3'}, f)
    f['caseIds'] = [case] + sorted({c for x in children for c in x['caseIds']})
    f['actual'] = None
    f['evidence'] = []
    f['completionCondition'] = 'All required child capabilities accepted; deferred/excluded children remain explicitly unmigrated. Whole-file success cannot be inferred from one child.'

ledger = {k:copy.deepcopy(v) for k,v in baseline.items() if k not in ['fileRows','apiItems','status']}
shared = canonical(copy.deepcopy(api['sharedDecisions']))
shared['keyboard'] = {'type':'逐Unicode码点三合成键事件、undefined、value不变', 'press':'document三键事件、旧flags、undefined；Backspace也不编辑value',
                      'downUp':'各一事件、undefined、无held/modifier状态', 'native':'明确不支持真实编辑/系统快捷键；只证明合成事件与限制',
                      'mainOverride':'Corrects main earlier erroneous tail-edit description; authoritative current difference and canonical cases override historical author draft.'}
ledger.update(schemaVersion=2, candidateVersion='M5-C1', publicOwner=OWNER, baselineCounts={'fileRows':72,'apiItems':48},
              originalBaseline={'path':'stage0/baseline-ledger-v1.json','sha256':digest(STAGE/'baseline-ledger-v1.json')},
              fileRows=files, apiItems=members, capabilityItems=capabilities, resourceItems=resources,
              sourceClosureExtras=supplement.get('closureExtras', []),
              serviceErrorContract=canonical(supplement.get('errorContractSuggestions', {})),
              authorReferences={'apiReadCoverage':api['readCoverage'], 'apiEvidence':api['evidenceCatalog'], 'apiSharedDecisions':shared,
                                'apiUncertainties':api['uncertainties'], 'sdkEvidence':supplement['evidence'], 'sdkArchitecture':supplement['architecture']},
              mainSemanticOverrides=['Keyboard Backspace preserves synthetic events/value unchanged; erroneous earlier main tail deletion superseded explicitly',
                                     'title/content/url/wait/ChromeElement operate in selected authorized top or iframe document; no automatic frame traversal',
                                     'reload only selected tab/frame document', 'E_PERMISSION canonical E_PERMISSION_DENIED; no mode E_LEGACY_AMBIGUOUS_EXECUTION'],
              denominatorHistory=[denominator], status='stage0-mapped-not-implemented',
              caseResults={k:{'status':'not-tested','actual':None,'pass':None,'productPackageSha256':None,'prototypeCandidateSha256':None,'evidence':[]} for k in cases})
write(DOC/'source-compatibility-ledger.json',ledger)
write(DOC/'test-spec-v5.json',{'schemaVersion':1,'candidate':'M5-C1', 'assertionsOnly':True,
      'resultAuthority':'source-compatibility-ledger.json#/caseResults', 'mandatoryFamilies':families,
      'inheritedContracts':contracts, 'phaseBoundary':'SCR full business and OPT deferred; historical17 foundation contracts remain required; PLG only framework lifecycle',
      'evidenceContract':{'finalPackage':'one exact final production package hash; prior prototype and source proof cannot count',
                          'fields':['sourceHashes','candidateManifestSha256','productPackageSha256','chromeVersion','os','binarySha256','profile','extensionId','preconditions','input','expected','actual','pass','protocol','IDB','HTTP counters','files','cleanup','notTestedReason'],
                          'versions':['Chrome138 candidate minimum','execution-time officially acquired current Stable'],
                          'independence':'final reviewer does not author product; actual versions and raw evidence mandatory'},
      'fixtures':api['fixtureContract'], 'cases':list(cases.values())})

mapping=['# 当前迁移映射（由唯一账本派生）','', 'M5-C1；所有运行结果未测试，排除/延期不算迁移成功。', '', '|ID / 旧文件或符号|新模块|行为决定|用例与完成条件|','|---|---|---|---|']
for x in items:
    decision=x['behaviorDecision']
    reason=decision.get('reason') or decision.get('classification') or str(decision)
    mapping.append('|'+ '|'.join(str(v).replace('|','/').replace('\n',' ') for v in [x['id']+' / '+x['source'].get('symbol',x['source']['path'].split('/')[-1]), '<br>'.join(x['newModules']) or '本轮无runtime消费者',reason, ', '.join(x['caseIds'])+'；同最终包实测及独立验收，受限拒绝另账'])+'|')
(DOC/'migration-map-v5.md').write_text('\n'.join(mapping)+'\n')
progress=f'''# OpenDesk Browser 通用框架迁移 Goal 进度

当前原生Goal active；公共writer {OWNER}。新候选M5-C1阶段0待同一候选Architect→Critic独立审批，历史97/98与提示词评分不放行。

72来源原ID/hash全部保留，本轮有界hash核对0漂移；48成员判定48/48，行为通过0/48。所需能力合同0/{len(required)}；其中受限边界{len(restricted)}项另账，拒绝不算受限功能实现。SDK/服务等子项{len(capabilities)}、资源子项{len(resources)}，全部runtimePass=false。排除/延期{len(excluded)}项不进成功数；具体ID分母见唯一账本denominatorHistory。用例实际通过0/{len(cases)}，阶段0静态账本测试另列，不算产品验收。

仍未过门禁：currentPlanApproved=false；backendPrototypePassed=false；fullImplementationReleased=false；frameworkFunctionalMigrationComplete=false。F1现149局部证明，真实独立while(true)终止/资源、userScripts真实UI撤权与pending/doc/CSP、138/当前Stable完整矩阵仍缺。原生raw错误4失败和required permission撤销失败保留。R1–R8与历史17全部未关闭。

主顺序：阶段0冻结具体映射/语义/用例→同hash独立批准→F1两个v2后端→独立后端资格→F2公共底座→48成员/context/控制脚本→SDK/服务/资源独立接入→现工作台必要集成→F3同最终包全必需实测及独立代码/功能验收。产品初始37文件hash保留，审批前无产品写入。

逐项旧能力→新职责→差异→测试及完成条件见[migration-map-v5.md](migration-map-v5.md)，机器账本是[source-compatibility-ledger.json](source-compatibility-ledger.json)，具体断言[test-spec-v5.json](test-spec-v5.json)，唯一计划[execution-plan.md](execution-plan.md)。历史原记录完整保留stage0/，不恢复旧Goal，不进入完整采集、优化或发布。
'''
(DOC/'progress.md').write_text(progress)
print(json.dumps({'sources':72,'members':48,'capabilities':len(capabilities),'resources':len(resources),'required':len(required),'restricted':len(restricted),'excluded':len(excluded),'cases':len(cases),'runtimePass':0}))
