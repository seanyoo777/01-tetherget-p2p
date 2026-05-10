import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** cwd 와 무관하게 항상 server/data (이 파일 기준 ../data) */
const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "tetherget.db");

export const db = new Database(dbPath);
