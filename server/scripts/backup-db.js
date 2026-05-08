import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceFile = path.resolve(root, "server", "data", "tetherget.db");
const backupDir = path.resolve(root, "server", "backups");

if (!fs.existsSync(sourceFile)) {
  console.error("DB 파일이 없습니다:", sourceFile);
  process.exit(1);
}
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetFile = path.join(backupDir, `tetherget-${stamp}.db`);
fs.copyFileSync(sourceFile, targetFile);
console.log("백업 완료:", targetFile);
