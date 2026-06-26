const XLSX = require("xlsx");
const path = require("path");

function inspect(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  const keys = Object.keys(rows[0] || {});

  console.log("");
  console.log("FILE:", fileName);
  console.log("SHEET:", sheetName);
  console.log("ROWS:", rows.length);
  console.log("HEADERS:", keys.join(" | "));
  if (rows[0]) {
    const sample = {};
    for (const k of keys.slice(0, 12)) sample[k] = rows[0][k];
    console.log("FIRST_ROW_SAMPLE:", sample);
  }
}

try {
  inspect("FUSION BASE TRESO 2021-2023.xlsx");
  inspect("DIM REGION.xlsx");
} catch (e) {
  console.error("Error reading Excel:", e?.message || String(e));
}
