// Preview-only sidebar substitutions: two management icons and two contextual entry changes.
// Frozen source and all PC Settings markup remain untouched; fail closed on drift.
export function managementActionsPreview(source){
  const actions=[
    [`<Button id="quick-manage-profiles" className="textAction" onClick={()=>void openOptions('profiles')}>
            {t('sideManageAll')}
          </Button>`, `<ManagementAction id="quick-manage-profiles" icon="profile" label={t('sideManageAll')} destination={t('proxyProfiles')} onClick={()=>void openOptions('profiles')}/>`],
    [`<Button id="quick-manage-rules" className="textAction" onClick={()=>void openOptions('rules')}>{t('sideManageRules')}</Button>`, `<ManagementAction id="quick-manage-rules" icon="rules" label={t('sideManageRules')} destination={t('websiteRules2')} onClick={()=>void openOptions('rules')}/>`],
    // R17: Remove the duplicate footer entry pair only in the sidebar preview.
    ["    <nav className=\"r86Bottom\" aria-label={t('openSettings')}>\n      <Button type=\"button\" onClick={()=>void openOptions('subscriptions')}>\n        {t('popupSourceSubscriptions')}</Button>\n      <Button type=\"button\" onClick={()=>void openOptions('diagnostic')}>\n        {t('popupFooterDiagnostics')}</Button>\n    </nav>\n", ""],
    // A navigation-only diagnostics shortcut appears beside runtime failures.
    ["        {error&&<p className=\"notice error\" role=\"alert\">{error}</p>}\n      </section>\n      {savedHint&&<p className=\"r86Notice\" role=\"status\">{t('sideProxySavedNotApplied')}</p>", "        {error&&<p className=\"notice error\" role=\"alert\">{error}</p>}\n        {(blocked || state.runtime.proxyError || state.runtime.statusErrorCode || state.runtime.outcomeUnknown) &&\n          <Button type=\"button\" variant=\"quiet\" className=\"apDiagnosticEntry\"\n            title={t('usageOpenFor',{site:t('networkDiagnostics2')})}\n            onClick={()=>void openOptions('diagnostic')}>\n            {t('networkDiagnostics2')}<span aria-hidden=\"true\">↗</span>\n          </Button>}\n      </section>\n      {savedHint&&<p className=\"r86Notice\" role=\"status\">{t('sideProxySavedNotApplied')}</p>"]
  ];
  for(const [before,after]of actions){
    if(source.split(before).length!==2)throw Error('Frozen sidebar preview input changed; review substitutions');
    source=source.replace(before,after);
  }
  return "import {ManagementAction} from '../preview/ManagementAction.jsx';\n"+source;
}
