import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dataDir = path.resolve(process.cwd(), "server", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "tetherget.db");

export const db = new Database(dbPath);
