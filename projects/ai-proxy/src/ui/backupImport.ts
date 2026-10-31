import { migrateV1, validateConfig } from '../domain/config';

export const BACKUP_MAX_BYTES = 1024 * 1024;
export type BackupImportErrorKey = 'errBackupTooLarge' | 'invalidJson' | 'backupInvalidFormat';

/** Pure front-end validation; the MV3 worker independently validates IMPORT. */
export class BackupImportValidationError extends Error {
  constructor(public readonly key: BackupImportErrorKey) {
    super(key);
    this.name = 'BackupImportValidationError';
  }
}
export function parseBackupForImport(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > BACKUP_MAX_BYTES)
    throw new BackupImportValidationError('errBackupTooLarge');
  let input: unknown;
  try { input = JSON.parse(text); }
  catch { throw new BackupImportValidationError('invalidJson'); }
  try {
    if (input && typeof input === 'object' && 'schemaVersion' in input &&
        input.schemaVersion === 1) migrateV1(input);
    else validateConfig(input);
  } catch { throw new BackupImportValidationError('backupInvalidFormat'); }
  // Preserve v1/v2 source. Worker independently validates and ensures
  // Chrome proxy control was released before replacing the stored settings.
  return input;
}
