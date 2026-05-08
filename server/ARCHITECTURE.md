# TetherGet Backend Architecture (Scalable Path)

## Current
- API: `Express` (`server/index.js`)
- DB: `SQLite` (`better-sqlite3`) for fast local iteration
- Auth: JWT access token, role-based guard (super admin check)

## Near-Term Migration (for 100k+ concurrent planning)
1. Replace SQLite storage layer with PostgreSQL (`DATABASE_URL`).
2. Add Redis for:
   - token blacklist / session revocation
   - rate limiting counters
   - presence + unread cache for messenger
3. Split services:
   - `api-auth-trade` (REST)
   - `chat-gateway` (WebSocket)
   - `worker` (notifications, risk jobs)

## Key Design Rules
- Stateless API nodes (horizontal scaling via load balancer).
- Shared state only in Postgres/Redis/object storage.
- Every privileged action goes through role checks and audit logs.
- Async jobs via queue before high-scale production (BullMQ/Kafka).

## Local Run
- `npm run dev:api` : API server
- `npm run dev` : Frontend
- `npm run dev:full` : both together
- `docker compose up -d` : Postgres + Redis (for migration phase)
