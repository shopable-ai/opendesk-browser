import {demoConfig} from './demo-config.js';

// This second import also exercises a transitive local module dependency.
export function counter(count, action) {
  return action === 'increment' ? count + demoConfig.counterStep : count;
}
