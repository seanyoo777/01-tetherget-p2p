import crypto from "node:crypto";

const RAW_KEY = process.env.KYC_ENCRYPTION_KEY || "dev-unsafe-key-change-in-production";
const KEY = crypto.createHash("sha256").update(String(RAW_KEY)).digest();

export function encryptText(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `ENC:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptText(cipherText) {
  if (!cipherText || typeof cipherText !== "string") return "";
  if (!cipherText.startsWith("ENC:")) return cipherText;
  const [, ivB64, tagB64, dataB64] = cipherText.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptBuffer(inputBuffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv, tag };
}

export function decryptBuffer(encryptedBuffer, ivBuffer, tagBuffer) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, ivBuffer);
  decipher.setAuthTag(tagBuffer);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}
