import * as React from 'react';
import {Button} from '@opendesk/ui';
import {useI18n} from '../i18n/LocaleProvider';
import {HEADER_ACTION_IDS} from './header-actions';

const labels={'add-proxy':'addProxy',diagnostics:'networkDiagnostics2',subscriptions:'subscriptionSources',settings:'apManageSettings',official:'officialNetwork'};
export function HeaderActionsEditor({store,disabled=false}){
 const {t}=useI18n();
 if(!store)return null;
 const state=store.getSnapshot(),locked=disabled||state.busy||state.unknown||!state.ready;
 const dirty=JSON.stringify(state.draft)!==JSON.stringify(state.saved);
 function move(index,delta){const next=[...state.draft];[next[index],next[index+delta]]=[next[index+delta],next[index]];store.edit(next);}
 return <section className="generalInfoCard headerActionsEditor" aria-labelledby="header-actions-title">
  <strong id="header-actions-title">{t('apHeaderTitle')}</strong>
  <p className="hint">{t('apHeaderHelp')}</p>
  <div className="headerActionsChoices">{HEADER_ACTION_IDS.map(id=><label key={id}>
   <input type="checkbox" checked={state.draft.includes(id)} disabled={locked}
    onChange={event=>store.edit(event.target.checked?[...state.draft,id]:state.draft.filter(value=>value!==id))}/>{t(labels[id])}
  </label>)}</div>
  <ol>{state.draft.map((id,index)=><li key={id}>
   <span>{t(labels[id])}</span><Button aria-label={t('apHeaderMoveUp')+' '+t(labels[id])} disabled={locked||index===0} onClick={()=>move(index,-1)}>{t('apHeaderMoveUp')}</Button>
   <Button aria-label={t('apHeaderMoveDown')+' '+t(labels[id])} disabled={locked||index===state.draft.length-1} onClick={()=>move(index,1)}>{t('apHeaderMoveDown')}</Button>
  </li>)}</ol>
  <div className="actions">
   <Button disabled={locked||state.readRequired||!dirty} onClick={()=>void store.save()}>{t('saveChanges')}</Button>
   <Button disabled={disabled||state.busy} onClick={()=>void store.reload()}>{t(state.readRequired||state.error?'apHeaderReload':'cancel')}</Button>
  </div>
  {state.savedNotice&&<p role="status">{t('apHeaderSaved')}</p>}
  {state.error&&<p role="alert">{t(state.error)}</p>}
 </section>;
}
