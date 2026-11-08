import * as React from 'react';
import {useSettingsEffect} from '../../../src/ui/react/use-settings-effect.ts';
import {timeReviewText,timeReviewOriginText} from './localization.js';

export function TimeReviewSettings({model,actions}){
  const ref=useSettingsEffect(model);
  const text=(key,parameters)=>timeReviewText(model?.locale||'zh-CN',key,parameters);
  if(!model)return null;
  return <section id="time-review-permission-settings" className="od-trusted-settings-actions" aria-label={text('permissions')} hidden={!model.visible} ref={ref}>
<p>
{text('intro')}
</p>
<button onClick={event=>actions?.['time-review-grant-idle']?.(event.nativeEvent)} disabled={model.busy} hidden={model.idleGranted} id="time-review-grant-idle" type="button" className="od-button od-button--secondary">
{text('grantIdle')}
</button>
<button onClick={event=>actions?.['time-review-revoke-idle']?.(event.nativeEvent)} disabled={model.busy} hidden={!model.idleGranted} id="time-review-revoke-idle" type="button" className="od-button od-button--secondary">
{text('revokeIdle')}
</button>
<p>
{text('independent')}
</p>
<button onClick={event=>actions?.['time-review-site-current-open']?.(event.nativeEvent)} disabled={model.busy} hidden={model.currentGrantHidden} id="time-review-site-current-open" type="button" className="od-button od-button--secondary">
{text('currentOpen')}
</button>
<section id="time-review-site-confirm" className="od-trusted-settings-review" aria-label={text('currentReview')} hidden={!model.siteReview}>
<p id="time-review-site-confirm-text">{model.confirmText}</p>
<button onClick={event=>actions?.['time-review-site-current-approve']?.(event.nativeEvent)} disabled={model.busy} id="time-review-site-current-approve" type="button" className="od-button od-button--secondary">
{text('currentApprove')}
</button>
<button onClick={event=>actions?.['time-review-site-current-cancel']?.(event.nativeEvent)} disabled={model.busy} id="time-review-site-current-cancel" type="button" className="od-button od-button--secondary">
{text('cancel')}
</button>

</section>
<button onClick={event=>actions?.['time-review-site-all-open']?.(event.nativeEvent)} disabled={model.busy} hidden={model.allGrantHidden} id="time-review-site-all-open" type="button" className="od-button od-button--secondary">
{text('allOpen')}
</button>
<section id="time-review-site-all-confirm" className="od-trusted-settings-review" aria-label={text('allReview')} hidden={!model.allReview}>
<p>
{text('allConfirm')}
</p>
<button onClick={event=>actions?.['time-review-site-all-approve']?.(event.nativeEvent)} disabled={model.busy} id="time-review-site-all-approve" type="button" className="od-button od-button--secondary">
{text('allApprove')}
</button>
<button onClick={event=>actions?.['time-review-site-all-cancel']?.(event.nativeEvent)} disabled={model.busy} id="time-review-site-all-cancel" type="button" className="od-button od-button--secondary">
{text('cancel')}
</button>

</section>
<button onClick={event=>actions?.['time-review-site-all-revoke']?.(event.nativeEvent)} disabled={model.busy} hidden={model.revokeAllHidden} id="time-review-site-all-revoke" type="button" className="od-button od-button--secondary">
{text('allRevoke')}
</button>
<p id="time-review-site-grants-status" role="status">
{model.siteStatus}
</p>
<div id="time-review-site-grants-list" aria-label={text('grantedWebsites')}>
{model.origins.map(origin=><div key={origin} className="time-review-site-grant-row"><span>{origin}</span><button type="button" className="od-button od-button--secondary" disabled={model.busy} title={timeReviewOriginText(model.locale,'revokeSite',origin)} aria-label={timeReviewOriginText(model.locale,'revokeSite',origin)} onClick={event=>actions?.revokeSite(origin,event.nativeEvent)}>{text('revoke')}</button></div>)}
</div>
<button onClick={event=>actions?.['time-review-trusted-start']?.(event.nativeEvent)} disabled={model.busy} hidden={model.nativeStart} id="time-review-trusted-start" type="button" className="od-button od-button--secondary">
{text('start')}
</button>
<button onClick={event=>actions?.['time-review-clear-open']?.(event.nativeEvent)} disabled={model.busy} id="time-review-clear-open" type="button" className="od-button od-button--secondary">
{text('clearOpen')}
</button>
<section id="time-review-inline-clear-review" className="od-trusted-settings-review" aria-label={text('clearReview')} hidden={!model.clearReview}>
<p>
{text('clearConfirm')}
</p>
<button onClick={event=>actions?.['time-review-clear-approve']?.(event.nativeEvent)} disabled={model.busy} id="time-review-clear-approve" type="button" className="od-button od-button--secondary">
{text('clearApprove')}
</button>
<button onClick={event=>actions?.['time-review-clear-cancel']?.(event.nativeEvent)} disabled={model.busy} id="time-review-clear-cancel" type="button" className="od-button od-button--secondary">
{text('cancel')}
</button>

</section>
<p>
{text('minuteIntro')}
</p>
<button onClick={event=>actions?.['time-review-minute-enable']?.(event.nativeEvent)} disabled={model.busy} id="time-review-minute-enable" type="button" className="od-button od-button--secondary">
{text('minuteEnable')}
</button>
<button onClick={event=>actions?.['time-review-minute-disable']?.(event.nativeEvent)} disabled={model.busy} id="time-review-minute-disable" type="button" className="od-button od-button--secondary">
{text('minuteDisable')}
</button>
<section id="time-review-minute-delete-review" className="od-trusted-settings-review" aria-label={text('minuteReview')} hidden={!model.minuteReview}>
<p>
{text('minuteConfirm')}
</p>
<button onClick={event=>actions?.['time-review-minute-delete-approve']?.(event.nativeEvent)} disabled={model.busy} id="time-review-minute-delete-approve" type="button" className="od-button od-button--secondary">
{text('minuteApprove')}
</button>
<button onClick={event=>actions?.['time-review-minute-delete-cancel']?.(event.nativeEvent)} disabled={model.busy} id="time-review-minute-delete-cancel" type="button" className="od-button od-button--secondary">
{text('cancel')}
</button>

</section>

</section>;
}
