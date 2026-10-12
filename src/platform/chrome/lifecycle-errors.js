// Chrome rejects extension API work once its browser client is shutting down.
// Only passive teardown callers may classify that exact rejection. Nothing
// here retries an operation, changes its outcome, or claims cleanup completed.
export const BROWSER_CLEANUP_INTERRUPTED='OpenDesk browser cleanup interrupted';
export const BROWSER_SHUTDOWN_MESSAGE='The browser is shutting down.';
export const PASSIVE_BROWSER_CLEANUPS=Object.freeze([
  'context-menu-tab-removed','page-preview-tab-removed',
  'foundation-tab-removed','foundation-port-disconnected'
]);
export function reportBrowserCleanupError(error,{phase,label,logger=console}={}){
  if(PASSIVE_BROWSER_CLEANUPS.includes(phase)&&error?.message===BROWSER_SHUTDOWN_MESSAGE){
    logger.warn(BROWSER_CLEANUP_INTERRUPTED,phase,error);
    return;
  }
  logger.error(label,error);
}
