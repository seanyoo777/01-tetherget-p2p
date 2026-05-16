import fs from "fs";
const p = "src/App.jsx";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
const start = lines.findIndex((l) => l.includes("{false && authToken && (myProgressOrders"));
const grid = lines.findIndex((l, i) => i > start && l.includes('className="grid grid-cols-1 gap-3 sm:grid-cols-2'));
if (start >= 0 && grid > start) {
  lines.splice(start, grid - start);
  fs.writeFileSync(p, lines.join("\n"));
  console.log(`Removed lines ${start + 1}-${grid}`);
} else {
  console.error("Not found", start, grid);
  process.exit(1);
}
