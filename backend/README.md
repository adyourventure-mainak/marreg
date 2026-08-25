# MARREG API

Modern REST backend for the Government of West Bengal Registrar General of Marriages portal.

## Local bootstrap

1. `docker compose up -d`
2. `npm install && npm run prisma:generate`
3. `npm run start:dev`

API base: `http://localhost:4000/api/v1`.

The OTP service is intentionally a development foundation in this first module. Production delivery requires a provider adapter, hashed OTP persistence in PostgreSQL/Redis, rate limiting, rotating refresh-token families, Argon2id officer login, TOTP, and OpenAPI generation before go-live.
