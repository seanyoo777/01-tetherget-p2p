import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const backupFile = process.env.BACKUP_FILE;
if (!backupFile) {
  console.error("BACKUP_FILE 환경변수를 지정하세요. 예: BACKUP_FILE=server/backups/xxx.db");
  process.exit(1);
}

const sourceFile = path.resolve(root, backupFile);
const targetFile = path.resolve(root, "server", "data", "tetherget.db");
if (!fs.existsSync(sourceFile)) {
  console.error("백업 파일을 찾을 수 없습니다:", sourceFile);
  process.exit(1);
}

fs.copyFileSync(sourceFile, targetFile);
console.log("복구 완료:", targetFile, "<-", sourceFile);
