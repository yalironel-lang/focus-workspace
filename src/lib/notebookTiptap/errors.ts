/** Typed conversion errors — fail closed; never persist on failure. */

export type NotebookTiptapErrorCode =
  | 'unsupported_node'
  | 'unsupported_mark'
  | 'unsupported_attr'
  | 'hard_break'
  | 'list_depth'
  | 'malformed_input'
  | 'multi_block_list_item';

export class NotebookTiptapConversionError extends Error {
  readonly code: NotebookTiptapErrorCode;
  readonly detail?: string;

  constructor(code: NotebookTiptapErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'NotebookTiptapConversionError';
    this.code = code;
    this.detail = detail;
  }
}

export function isNotebookTiptapConversionError(
  err: unknown,
): err is NotebookTiptapConversionError {
  return err instanceof NotebookTiptapConversionError;
}
