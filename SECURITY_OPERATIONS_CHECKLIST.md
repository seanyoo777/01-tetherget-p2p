# Security Operations Checklist

This checklist helps keep the source and user data private under your control.

## 1) Repository Privacy
- Keep repository visibility **private**.
- Remove unknown collaborators immediately.
- Enable 2FA for all repo users.
- Use branch protection for main branch.

## 2) Secret Management
- Never commit `.env` or key files.
- Rotate secrets on any suspicion:
  - `JWT_SECRET`
  - `KYC_ENCRYPTION_KEY`
  - webhook credentials / API keys
- Store production secrets in a secret manager (not plaintext files).

## 3) Data Protection
- KYC files are encrypted at rest (`server/secure-docs`).
- Keep DB backups encrypted and access-restricted.
- Restrict access to KYC decryption APIs to admin roles only.

## 4) Admin Control Safety
- Keep final approval as one designated main admin.
- Enforce multi-approval before final release.
- Require PIN + OTP for final approval.
- Review dispute and KYC access logs daily.

## 5) Incident Response
- If unauthorized access is suspected:
  1. Disable admin sessions (re-login required).
  2. Rotate all secrets.
  3. Export and preserve audit logs.
  4. Verify hash-chain integrity endpoints.
  5. Restore from known-good backup if needed.

## 6) Backup & Restore Discipline
- Run backup daily (`npm run backup:db`).
- Test restore weekly in isolated environment.
- Keep at least 7 daily + 4 weekly backups.

## 7) Deployment Hardening
- Serve only over HTTPS.
- Put API behind WAF / rate limiting.
- Restrict admin endpoints by IP where possible.
- Enable alerting for:
  - repeated failed logins
  - repeated OTP failures
  - policy/PIN changes
