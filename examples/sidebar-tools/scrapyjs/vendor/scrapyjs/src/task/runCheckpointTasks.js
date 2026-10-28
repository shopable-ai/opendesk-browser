'use strict';

const copy = value => JSON.parse(JSON.stringify(value));
const fault = code => Object.assign(new Error(code), { code });

// The caller owns discovery, website validation, budget and the storage lease.
// A completed save is the commit point. Downloads before it are at-least-once.
async function runCheckpointTasks({ checkpoint, execute, save, validate,
  canStart = () => true, isUnstartedLimit = () => false }) {
  if (![execute, save, validate, canStart, isUnstartedLimit].every(fn => typeof fn === 'function')) throw fault('TASK_OPTIONS');
  let committed = copy(checkpoint);
  validate(committed);
  if (!Array.isArray(committed.jobs)) throw fault('CHECKPOINT_INVALID');
  for (let index = 0; index < committed.jobs.length; index++) {
    const job = committed.jobs[index];
    if (job.state === 'done') continue;
    if (!['pending', 'failed'].includes(job.state)) throw fault('CHECKPOINT_INVALID');
    if (!await canStart()) break;
    let nextJob;
    try {
      const item = await execute(copy(job));
      nextJob = { ...job, state: 'done', item: copy(item), errorCode: null };
    } catch (error) {
      if (await isUnstartedLimit(error, copy(job))) break;
      nextJob = { ...job, state: 'failed', item: null,
        errorCode: typeof error?.code === 'string' && error.code ? error.code : 'DETAIL_FAILED' };
    }
    const next = copy(committed);
    next.jobs[index] = nextJob;
    validate(next);
    // Validation/storage errors are fatal, never detail failures.
    await save(copy(next));
    committed = next;
  }
  return committed;
}

module.exports = runCheckpointTasks;
