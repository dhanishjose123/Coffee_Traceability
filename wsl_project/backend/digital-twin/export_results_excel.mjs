import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const tablesDir = process.env.RESULTS_DIR || path.join(baseDir, 'logs', 'tables');
const outputDir = process.env.EXCEL_OUT_DIR || tablesDir;
const outputPath = path.join(outputDir, 'digital-twin-experiment-results.xlsx');

const csvPath = path.join(tablesDir, 'latest-experiment-results.csv');
const conflictKeysCsvPath = path.join(tablesDir, 'conflict-keys-table.csv');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function asNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function rowsToObjects(rows) {
  const [headers, ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function matrixFromObjects(objects, headers) {
  return [
    headers,
    ...objects.map((row) => headers.map((header) => {
      if (['targetFunctionTps', 'totalTargetTps', 'achievedTps', 'submittedTps', 'avgLatencyMs', 'minLatencyMs', 'maxLatencyMs', 'p95LatencyMs', 'successRatePct', 'failureRatePct', 'success', 'failure', 'queued', 'skipped', 'learnedConflictKeys', 'reward'].includes(header)) {
        return asNumber(row[header]);
      }
      return row[header] ?? '';
    }))
  ];
}

function formatTable(sheet, rangeAddress, numericCols = []) {
  const range = sheet.getRange(rangeAddress);
  range.format.borders = { preset: 'all', style: 'thin', color: '#D9E2EC' };
  const header = range.getRow(0);
  header.format = {
    fill: '#1F4E79',
    font: { bold: true, color: '#FFFFFF' },
    wrapText: true
  };
  range.format.autofitColumns();
  range.format.autofitRows();
  numericCols.forEach((col) => {
    sheet.getRange(col).format.numberFormat = '0.00';
  });
}

function writeSheet(workbook, name, rows) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  if (!rows.length) {
    sheet.getRange('A1').values = [['No rows available']];
    return sheet;
  }

  const headers = Object.keys(rows[0]);
  const matrix = matrixFromObjects(rows, headers);
  const lastCol = String.fromCharCode(64 + headers.length);
  const rangeAddress = `A1:${lastCol}${matrix.length}`;
  sheet.getRange(rangeAddress).values = matrix;
  formatTable(sheet, rangeAddress);
  sheet.freezePanes.freezeRows(1);
  return sheet;
}

function writeSummary(workbook, rows) {
  const sheet = workbook.worksheets.add('Summary');
  sheet.showGridLines = false;

  const latestRows = rows.map((row) => ({
    Function: row.functionName,
    Mode: row.mode,
    'Target TPS': asNumber(row.targetFunctionTps),
    'Achieved TPS': asNumber(row.achievedTps),
    'Submitted TPS': asNumber(row.submittedTps),
    'Avg Latency ms': asNumber(row.avgLatencyMs),
    'Min Latency ms': asNumber(row.minLatencyMs),
    'Max Latency ms': asNumber(row.maxLatencyMs),
    'P95 Latency ms': asNumber(row.p95LatencyMs),
    'Success %': asNumber(row.successRatePct),
    'Failure %': asNumber(row.failureRatePct),
    Success: asNumber(row.success),
    Failure: asNumber(row.failure),
    Queued: asNumber(row.queued),
    Skipped: asNumber(row.skipped),
    'Learned Keys': asNumber(row.learnedConflictKeys),
    'Conflict Keys': row.conflictKeys || ''
  }));

  sheet.getRange('A1:Q1').merge();
  sheet.getRange('A1').values = [['Digital Twin Experiment Results']];
  sheet.getRange('A1').format = {
    fill: '#0F172A',
    font: { bold: true, color: '#FFFFFF', size: 16 }
  };
  sheet.getRange('A3:Q3').values = [Object.keys(latestRows[0] || {
    Function: '', Mode: '', 'Target TPS': '', 'Achieved TPS': '', 'Submitted TPS': '', 'Avg Latency ms': '', 'Min Latency ms': '', 'Max Latency ms': '', 'P95 Latency ms': '', 'Success %': '', 'Failure %': '', Success: '', Failure: '', Queued: '', Skipped: '', 'Learned Keys': '', 'Conflict Keys': ''
  })];

  if (latestRows.length) {
    sheet.getRange(`A4:Q${latestRows.length + 3}`).values = latestRows.map((row) => Object.values(row));
  }

  formatTable(sheet, `A3:Q${Math.max(4, latestRows.length + 3)}`);
  sheet.getRange(`J4:K${Math.max(4, latestRows.length + 3)}`).format.numberFormat = '0.0';
  sheet.getRange(`C4:I${Math.max(4, latestRows.length + 3)}`).format.numberFormat = '0.00';
  sheet.freezePanes.freezeRows(3);
  return sheet;
}

await fs.mkdir(outputDir, { recursive: true });

const csvText = await fs.readFile(csvPath, 'utf8');
const parsedRows = parseCsv(csvText);
const rows = rowsToObjects(parsedRows);
let conflictKeyRows = [];
try {
  const conflictKeysCsvText = await fs.readFile(conflictKeysCsvPath, 'utf8');
  conflictKeyRows = rowsToObjects(parseCsv(conflictKeysCsvText));
} catch (_) {
  conflictKeyRows = [];
}

const workbook = Workbook.create();
writeSummary(workbook, rows);
writeSheet(workbook, 'Learned Conflict Keys', conflictKeyRows);
writeSheet(workbook, 'Conflict Identification', rows.filter((row) => row.mode === 'conflict-identification'));
writeSheet(workbook, 'Queued Simulation', rows.filter((row) => row.mode === 'queued-simulation'));
writeSheet(workbook, 'All Results', rows);

const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 100 },
  summary: 'formula error scan'
});
console.log(errors.ndjson);

const preview = await workbook.render({ sheetName: 'Summary', autoCrop: 'all', scale: 1, format: 'png' });
await fs.writeFile(path.join(outputDir, 'digital-twin-experiment-results-preview.png'), new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Workbook saved: ${outputPath}`);
