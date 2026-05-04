import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParseNode = require("pdf-parse/node");
console.log("pdfParseNode type:", typeof pdfParseNode);
console.log("pdfParseNode structure:", pdfParseNode);
