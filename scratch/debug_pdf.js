import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
console.log("Type of pdfParse:", typeof pdfParse);
console.log("Keys of pdfParse:", Object.keys(pdfParse));
if (typeof pdfParse !== "function" && pdfParse.default) {
  console.log("pdfParse.default is a function:", typeof pdfParse.default === "function");
}
