import 'dotenv/config';
import { Sandbox } from 'e2b';

const workdir = '/tmp/bilig-workpaper-formula-readback';

const proofScript = String.raw`
import {
  WorkPaper,
  createWorkPaperFromDocument,
  exportWorkPaperDocument,
  parseWorkPaperDocument,
  serializeWorkPaperDocument,
} from '@bilig/workpaper';

const workbook = WorkPaper.buildFromSheets({
  Assumptions: [
    ['Metric', 'Value'],
    ['Qualified opportunities', 20],
    ['Win rate', 0.25],
    ['Average ARR', 12000],
    ['Expansion multiplier', 1.1],
  ],
  Summary: [
    ['Metric', 'Value'],
    ['Expected customers', '=Assumptions!B2*Assumptions!B3'],
    ['Expected ARR', '=B2*Assumptions!B4'],
    ['Expansion ARR', '=B3*Assumptions!B5'],
    ['Target gap', '=B4-100000'],
  ],
});

const assumptionsSheet = requireSheet(workbook, 'Assumptions');
const summarySheet = requireSheet(workbook, 'Summary');

const before = readSummary(workbook, summarySheet);
const beforeFormulas = readFormulaContracts(workbook, summarySheet);
const previousValue = workbook.getCellSerialized({ sheet: assumptionsSheet, row: 2, col: 1 });

workbook.setCellContents({ sheet: assumptionsSheet, row: 2, col: 1 }, 0.4);

const after = readSummary(workbook, summarySheet);
const afterFormulas = readFormulaContracts(workbook, summarySheet);
const serialized = serializeWorkPaperDocument(exportWorkPaperDocument(workbook, { includeConfig: true }));
const restored = createWorkPaperFromDocument(parseWorkPaperDocument(serialized));
const restoredSummarySheet = requireSheet(restored, 'Summary');
const restoredSummary = readSummary(restored, restoredSummarySheet);
const restoredFormulas = readFormulaContracts(restored, restoredSummarySheet);

const output = {
  editedCell: 'Assumptions!B3',
  before,
  after,
  restored: restoredSummary,
  formulas: afterFormulas,
  checks: {
    previousValue,
    newValue: workbook.getCellSerialized({ sheet: assumptionsSheet, row: 2, col: 1 }),
    formulasUnchanged: sameJson(beforeFormulas, afterFormulas),
    formulasPersisted: sameJson(afterFormulas, restoredFormulas),
    computedOutputChanged: before.expectedArr !== after.expectedArr,
    restoredMatchesAfter: sameJson(after, restoredSummary),
    serializedBytes: Buffer.byteLength(serialized, 'utf8'),
  },
};

const verified =
  output.checks.previousValue === 0.25 &&
  output.checks.newValue === 0.4 &&
  output.checks.formulasUnchanged &&
  output.checks.formulasPersisted &&
  output.checks.computedOutputChanged &&
  output.checks.restoredMatchesAfter &&
  output.checks.serializedBytes > 0 &&
  output.before.expectedArr === 60000 &&
  output.after.expectedArr === 96000;

if (!verified) {
  throw new Error('Bilig WorkPaper verification failed: ' + JSON.stringify(output));
}

console.log(JSON.stringify({ verified, ...output }, null, 2));

function requireSheet(workpaper, sheetName) {
  const sheetId = workpaper.getSheetId(sheetName);
  if (sheetId === undefined) {
    throw new Error('Expected sheet "' + sheetName + '" to exist');
  }
  return sheetId;
}

function readSummary(workpaper, sheet) {
  return {
    expectedCustomers: readNumber(workpaper, sheet, 1, 1, 'expected customers'),
    expectedArr: readNumber(workpaper, sheet, 2, 1, 'expected ARR'),
    expansionArr: readNumber(workpaper, sheet, 3, 1, 'expansion ARR'),
    targetGap: readNumber(workpaper, sheet, 4, 1, 'target gap'),
  };
}

function readFormulaContracts(workpaper, sheet) {
  return {
    expectedCustomers: readFormula(workpaper, sheet, 1, 1, 'expected customers'),
    expectedArr: readFormula(workpaper, sheet, 2, 1, 'expected ARR'),
    expansionArr: readFormula(workpaper, sheet, 3, 1, 'expansion ARR'),
    targetGap: readFormula(workpaper, sheet, 4, 1, 'target gap'),
  };
}

function readNumber(workpaper, sheet, row, col, label) {
  const cell = workpaper.getCellValue({ sheet, row, col });
  if (!cell || typeof cell !== 'object' || !('value' in cell) || typeof cell.value !== 'number') {
    throw new Error('Expected ' + label + ' to be a number, received ' + JSON.stringify(cell));
  }
  return Math.round(cell.value * 100) / 100;
}

function readFormula(workpaper, sheet, row, col, label) {
  const formula = workpaper.getCellFormula({ sheet, row, col });
  if (formula === undefined) {
    throw new Error('Expected ' + label + ' to be a formula');
  }
  return formula;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
`;

async function run() {
  if (!process.env.E2B_API_KEY) {
    throw new Error('Set E2B_API_KEY in .env before running this example.');
  }

  console.log('Creating E2B sandbox...');
  const sandbox = await Sandbox.create({ timeoutMs: 600_000 });

  try {
    console.log('Preparing WorkPaper verification script...');
    await sandbox.commands.run(`mkdir -p ${workdir}`);
    await sandbox.files.write(`${workdir}/workpaper-proof.mjs`, proofScript);

    console.log('Installing @bilig/workpaper@0.107.8 inside the sandbox...');
    await sandbox.commands.run('npm init -y >/dev/null && npm install @bilig/workpaper@0.107.8 >/dev/null', {
      cwd: workdir,
      timeoutMs: 120_000,
    });

    console.log('Running formula readback proof...');
    const result = await sandbox.commands.run('node workpaper-proof.mjs', {
      cwd: workdir,
      timeoutMs: 120_000,
    });

    console.log(result.stdout.trim());
  } finally {
    console.log('Cleaning up sandbox...');
    await sandbox.kill();
  }
}

run().catch((error) => {
  console.error('Failed to run Bilig WorkPaper formula readback example:', error);
  process.exit(1);
});
