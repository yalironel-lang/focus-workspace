/**
 * Seed workbooks for the PR1 Univer feasibility spike.
 * Partial IWorkbookData shapes accepted by createWorkbook().
 */

export type SpikeCellMap = Record<number, Record<number, { v?: string | number; f?: string; t?: number }>>;

export type SpikeWorkbookSeed = {
  id: string;
  name: string;
  appVersion: string;
  locale: string;
  styles: Record<string, unknown>;
  sheetOrder: string[];
  sheets: Record<
    string,
    {
      id: string;
      name: string;
      rowCount: number;
      columnCount: number;
      cellData: SpikeCellMap;
    }
  >;
};

const SHEET_ID = 'sheet-1';

function baseWorkbook(id: string, name: string, cellData: SpikeCellMap, rows = 100, cols = 26): SpikeWorkbookSeed {
  return {
    id,
    name,
    appVersion: '0.25.1',
    locale: 'enUS',
    styles: {},
    sheetOrder: [SHEET_ID],
    sheets: {
      [SHEET_ID]: {
        id: SHEET_ID,
        name: 'Sheet1',
        rowCount: rows,
        columnCount: cols,
        cellData,
      },
    },
  };
}

/** Nearly empty sheet. */
export function fixtureEmpty(): SpikeWorkbookSeed {
  return baseWorkbook('spike-empty', 'Spike Empty', {});
}

/** Formula coverage: + * SUM AVERAGE, invalid, div/0. */
export function fixtureFormulas(): SpikeWorkbookSeed {
  const cellData: SpikeCellMap = {
    0: {
      0: { v: 10 }, // A1
      1: { v: 20 }, // B1
      2: { f: '=A1+B1' }, // C1
    },
    1: {
      1: { v: 3 }, // B2
      2: { v: 4 }, // C2
      3: { f: '=B2*C2' }, // D2
    },
    2: { 0: { v: 1 } },
    3: { 0: { v: 2 } },
    4: { 0: { v: 3 } },
    5: { 0: { v: 4 } },
    6: { 0: { v: 5 } },
    7: {
      0: { f: '=SUM(A3:A7)' }, // A8
      1: { f: '=AVERAGE(A3:A7)' }, // B8
    },
    8: {
      0: { f: '=1/0' }, // A9 div/0
      1: { f: '=NOTAFORMULA(' }, // B9 invalid
    },
  };
  return baseWorkbook('spike-formulas', 'Spike Formulas', cellData);
}

function buildPopulated(id: string, name: string, count: number): SpikeWorkbookSeed {
  const cellData: SpikeCellMap = {};
  const cols = 10;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    if (!cellData[row]) cellData[row] = {};
    if (i % 7 === 0 && col > 0) {
      // sparse formulas referencing left neighbor
      const leftCol = col - 1;
      const a1Col = String.fromCharCode(65 + leftCol);
      cellData[row][col] = { f: `=${a1Col}${row + 1}*2` };
    } else if (i % 5 === 0) {
      cellData[row][col] = { v: `t${i}` };
    } else {
      cellData[row][col] = { v: i };
    }
  }
  const rows = Math.max(100, Math.ceil(count / cols) + 10);
  return baseWorkbook(id, name, cellData, rows, cols);
}

export function fixtureCells100(): SpikeWorkbookSeed {
  return buildPopulated('spike-100', 'Spike 100', 100);
}

export function fixtureCells1k(): SpikeWorkbookSeed {
  return buildPopulated('spike-1k', 'Spike 1k', 1000);
}

export function fixtureCells10k(): SpikeWorkbookSeed {
  return buildPopulated('spike-10k', 'Spike 10k', 10000);
}

export const SPIKE_FIXTURES = {
  empty: fixtureEmpty,
  formulas: fixtureFormulas,
  cells100: fixtureCells100,
  cells1k: fixtureCells1k,
  cells10k: fixtureCells10k,
} as const;

export type SpikeFixtureId = keyof typeof SPIKE_FIXTURES;
