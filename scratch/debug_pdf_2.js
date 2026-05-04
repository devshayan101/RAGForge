import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
console.log("pdfParse structure:", pdfParse);
if (typeof pdfParse === 'function') {
    console.log("It is a function");
} else {
    console.log("It is not a function, it is a", typeof pdfParse);
}
