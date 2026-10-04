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
function publicError(value) {
  const f = failure(value, 'processing');
  try { f.error.stage = f.stage; f.error.secondaryErrors = f.secondary.map(s => publicError(s)); } catch {}
  return f.error;
}
module.exports = { RunFailure, failure, publicError };
