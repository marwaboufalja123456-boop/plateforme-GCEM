import * as XLSX from "xlsx";
import path from "path";

const filePath = path.join(process.cwd(), "FUSION BASE TRESO 2021-2023.xlsx");
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log("Sheet Name:", sheetName);
console.log("Columns:", Object.keys(data[0] || {}));
console.log("Sample Row:", data[0]);
console.log("Total Rows:", data.length);
