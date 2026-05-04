import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mammoth = require("mammoth");
console.log("mammoth structure:", Object.keys(mammoth));
