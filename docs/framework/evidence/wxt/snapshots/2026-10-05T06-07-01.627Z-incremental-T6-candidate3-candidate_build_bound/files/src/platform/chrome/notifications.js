import {fail} from '../../framework/sdk/registry.js';
export function createNotificationService({api = globalThis.chrome, authorize, iconUrl, onLifecycle = () => {}} = {}) {
  const active = new Map(); let disposed = false;
  const emit = event => { try { onLifecycle(event); } catch { /* Receipt observation cannot repeat the effect. */ } };
  const onClosed = (notificationId, byUser) => {
    const context = active.get(notificationId); if (!context) return;
    active.delete(notificationId); emit({kind: 'closed', notificationId, byUser, requestId: context.requestId});
  };
  const onClicked = notificationId => {
    const context = active.get(notificationId); if (!context) return;
    emit({kind: 'clicked', notificationId, requestId: context.requestId});
    // CREATE_NOTIFY carries no URL; its click never opens a page.
    active.delete(notificationId); api.notifications.clear?.(notificationId, () => { void api.runtime?.lastError; });
  };
  api?.notifications?.onClosed?.addListener(onClosed);
  api?.notifications?.onClicked?.addListener(onClicked);
  return Object.freeze({async create({title, content}, context = {}) {
    if (disposed) throw fail('E_CANCELLED');
    if (!authorize) throw fail('E_PERMISSION', 'Notification driver requires broker authorization');
    await authorize({capability: 'notifications', phase: 'pre'}, context);
    context.assertDispatch?.();
    if (!api?.notifications?.create || !iconUrl) throw fail('E_RESOURCE_UNAVAILABLE', 'Notification driver or fixed icon missing', {stage: 'lookup'});
    if (typeof title !== 'string' || typeof content !== 'string') throw fail('E_SCHEMA');
    const notificationId = await new Promise((resolve, reject) => {
      try {
        api.notifications.create('', {type: 'basic', title, message: content, iconUrl}, notificationId => {
          const error = api.runtime?.lastError;
          if (error) reject(fail('E_NOTIFICATION', error.message));
          else if (typeof notificationId !== 'string' || !notificationId) reject(fail('E_NOTIFICATION', 'Missing native notification receipt'));
          else {
            if (!disposed) active.set(notificationId, context);
            emit({kind: 'created', notificationId, requestId: context.requestId, delivery: 'unobserved'});
            resolve(notificationId);
          }
        });
      } catch (error) { reject(fail('E_NOTIFICATION', error.message)); }
    });
    await context.recordNativeReceipt?.({notificationId});
    await context.recordEffect?.(undefined);
    await authorize({capability: 'notifications', phase: 'post'}, context);
    // Old createNotify resolves undefined. No page is opened on a notification click.
  }, dispose() {
    if (disposed) return; disposed = true;
    api?.notifications?.onClosed?.removeListener(onClosed); api?.notifications?.onClicked?.removeListener(onClicked); active.clear();
  }, diagnostics: () => ({active: active.size, disposed})});
}
