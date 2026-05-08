# KYC Encryption Key Rotation Guide

## Goal
Rotate `KYC_ENCRYPTION_KEY` safely without losing access to encrypted documents.

## Current State
- KYC text/file payloads are encrypted with AES-256-GCM.
- Key material is derived from `KYC_ENCRYPTION_KEY`.

## Recommended Rotation Process
1. **Prepare new key**
   - Generate strong random key and store in secret manager.
   - Do NOT remove old key yet.
2. **Dual-key mode**
   - Application reads `KYC_ENCRYPTION_KEY_ACTIVE` and `KYC_ENCRYPTION_KEY_PREVIOUS`.
   - Decrypt tries active key first, then previous key.
   - Encrypt always uses active key.
3. **Re-encrypt migration**
   - Background job reads each encrypted document/profile field.
   - Decrypt with old key, encrypt with new active key.
   - Mark record as migrated.
4. **Audit**
   - Verify all records migrated and decryptable with active key only.
5. **Finalize**
   - Remove previous key from runtime.

## Notes
- Rotation should be done during low-traffic window.
- Keep immutable backup before running migration.
- Log every re-encryption action for audit trail.
