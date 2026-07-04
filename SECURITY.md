# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `main` branch | ✅ Active |
| Deployed production (burntbeats.com) | ✅ Active |

We maintain a single production branch. Security patches are applied to `main` and deployed within 24 hours of verification.

## Reporting a Vulnerability

**Email**: burntbeats@burntbeats.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Your suggested fix (if any)

**Response timeline:**
- Acknowledgment within 48 hours
- Assessment and severity classification within 7 days
- Fix deployed within 30 days for critical/high severity

We do not currently operate a bug bounty program, but will credit responsible disclosures in our NOTICE file.

## Security Architecture

### Authentication & Authorization
- **Clerk** for user authentication (OAuth, email/password)
- Per-job HMAC tokens (`JOB_TOKEN_SECRET`) bind file access to authenticated sessions
- Internal service-to-service auth via `X-*-Service-Token` headers
- Rate limiting (Redis-backed distributed + in-memory fallback)

### Network Security
- Services bind to `127.0.0.1` (not exposed to public internet)
- Nginx reverse proxy handles TLS termination
- Docker Compose internal network for inter-service communication
- AWS Security Groups restrict EC2 ingress to ports 80/443

### Data Handling
- Uploaded audio files are scanned for malware before processing
- Stem output files are cleaned up after configurable TTL (48h default)
- No audio content is stored permanently unless user explicitly saves to their library
- S3 presigned URLs expire after 1 hour

### Secrets Management
- All secrets in `.env` files (gitignored)
- Production secrets set via environment variables on EC2
- `JOB_TOKEN_SECRET`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY` are required in production (server exits on startup if missing)
- API tokens enforce minimum length (16 chars)

### Dependencies
- `npm audit --audit-level=high` enforced in CI for both frontend and backend
- Dependabot configured for automated dependency updates
- Python lockfile (`uv.lock`) pinned and verified in CI
