import { describe, expect, it } from 'vitest';
import { SheetEngineError } from '../domain/sheetEngineErrors';
import { UniverSpreadsheetEngine } from './UniverSpreadsheetEngine';

describe('UniverSpreadsheetEngine (jsdom/happy-dom)', () => {
  it('throws ENGINE_NOT_MOUNTED when exporting before mount', () => {
    const engine = new UniverSpreadsheetEngine();
    try {
      engine.exportDocument();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SheetEngineError);
      expect((err as SheetEngineError).code).toBe('ENGINE_NOT_MOUNTED');
    }
  });

  it('throws ENGINE_NOT_MOUNTED for mutations before mount', () => {
    const engine = new UniverSpreadsheetEngine();
    try {
      engine.setCellValue('A1', 1);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SheetEngineError);
      expect((err as SheetEngineError).code).toBe('ENGINE_NOT_MOUNTED');
    }
  });
});
