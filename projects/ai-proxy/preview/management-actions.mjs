// Two explicit preview substitutions; baseline bytes remain a read-only reference.
// Fail on input drift instead of silently modifying a different button.
export function managementActionsPreview(source){
  const actions=[
    [`<Button id="quick-manage-profiles" className="textAction" onClick={()=>void openOptions('profiles')}>
            {t('sideManageAll')}
          </Button>`, `<ManagementAction id="quick-manage-profiles" icon="profile" label={t('sideManageAll')} destination={t('proxyProfiles')} onClick={()=>void openOptions('profiles')}/>`],
    [`<Button id="quick-manage-rules" className="textAction" onClick={()=>void openOptions('rules')}>{t('sideManageRules')}</Button>`, `<ManagementAction id="quick-manage-rules" icon="rules" label={t('sideManageRules')} destination={t('websiteRules2')} onClick={()=>void openOptions('rules')}/>`]
  ];
  for(const [before,after]of actions){
    if(source.split(before).length!==2)throw Error('Frozen sidebar management action changed; review preview substitution');
    source=source.replace(before,after);
  }
  return "import {ManagementAction} from '../preview/ManagementAction.jsx';\n"+source;
}
