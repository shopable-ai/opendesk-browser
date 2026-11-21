import React, { type ComponentProps } from 'react';
import { Button } from '@opendesk/ui';
import { useI18n } from '../i18n/LocaleProvider';

// A passive read must not move keyboard focus. Keep the route control in the
// tab order and make its pointer and keyboard activations inert until it settles.
export function ConnectionButton({syncing,onClick,...props}: ComponentProps<typeof Button> & {syncing:boolean}) {
  return <Button {...props} aria-disabled={(syncing&&!props.disabled)||undefined}
    onClick={event=>{if(syncing){event.preventDefault();return;}onClick?.(event);}}/>;
}

export function ConnectionSyncStatus({show}: {show:boolean}) {
  const {t}=useI18n();
  return <p className="connectionSyncStatus" role="status">{show?t('connectionSyncing'):null}</p>;
}
