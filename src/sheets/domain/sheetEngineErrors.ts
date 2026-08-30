/**
 * Typed Sheet domain/engine errors.
 * UI presentation belongs to a later Sheet shell / Free Space PR.
 */

export type SheetEngineErrorCode =
  | 'INVALID_DOCUMENT'
  | 'UNSUPPORTED_SCHEMA'
  | 'ENGINE_NOT_MOUNTED'
  | 'ENGINE_MOUNT_FAILED';

export class SheetEngineError extends Error {
  readonly code: SheetEngineErrorCode;

  constructor(code: SheetEngineErrorCode, message: string) {
    super(message);
    this.name = 'SheetEngineError';
    this.code = code;
  }
}

export function isSheetEngineError(err: unknown): err is SheetEngineError {
  return err instanceof SheetEngineError;
}
