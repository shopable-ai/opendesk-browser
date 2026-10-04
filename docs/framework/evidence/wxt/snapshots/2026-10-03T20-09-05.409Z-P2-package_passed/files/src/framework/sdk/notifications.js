import {fail} from './registry.js';
export function createNotifications(call) {
  return async function createNotify(title, content) {
    let description = '';
    if (typeof content === 'string') description = content;
    else if (typeof content === 'object') {
      if (content === null || typeof content.body !== 'string') throw fail('E_SCHEMA', 'Notification body must be a string');
      description = content.body;
    }
    return call('CREATE_NOTIFY', {title, content: description});
  };
}
