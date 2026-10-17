import * as React from 'react';
// Strict development-only trusted text: no Host, storage, HTML injection or permission.
export function DebugDiagnosticText({value=''}) {
  return <>{String(value??'')}</>;
}
