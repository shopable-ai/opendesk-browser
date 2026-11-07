// Internal envelopes record the actual failing boundary, independently of
// error names, codes, messages or user-provided stage properties.
class RunFailure {
  constructor(error, stage) {
    this.error = error instanceof Error ? error : new Error(String(error), { cause: error });
    this.stage = stage;
    this.secondary = [];
  }
}
function failure(error, stage) { return error instanceof RunFailure ? error : new RunFailure(error, stage); }
function secondaryFailures(f) {
  const result = []; const seen = new Set([f]);
  const visit = value => { if (seen.has(value)) return; seen.add(value); result.push(value); value.secondary.forEach(visit); };
  f.secondary.forEach(visit);
  return result;
}
function publicError(value) {
  const f = failure(value, 'processing');
  const secondary = secondaryFailures(f).map(s => { try { s.error.stage = s.stage; } catch {} return s.error; });
  try { f.error.stage = f.stage; f.error.secondaryErrors = secondary; } catch {}
  return f.error;
}
module.exports = { RunFailure, failure, publicError, secondaryFailures };
