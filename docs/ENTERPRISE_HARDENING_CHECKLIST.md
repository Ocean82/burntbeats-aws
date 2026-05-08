# Enterprise Hardening Checklist for BurntBeats AWS Deployment

This checklist outlines steps to elevate the BurntBeats application to enterprise-grade security, scalability, and observability standards. Prioritize based on your risk profile and compliance requirements.

## 1. Secrets Management (CRITICAL - Do Immediately)

- [ ] **Remove production secrets from `.env` files**: Never store live keys in source control. Use AWS Secrets Manager, Parameter Store, or similar.
- [ ] **Rotate exposed secrets**: Any keys in `backend/.env` (e.g., `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, AWS keys) must be rotated immediately.
- [ ] **Inject secrets at runtime**: Update `docker-compose.yml` to use environment variables from a secure source (e.g., `secrets` in Docker Compose or external vault).
- [ ] **Use `.env.example` only**: Keep example files in repo; load actual secrets from secure storage.
- [ ] **Audit secret usage**: Ensure no secrets are logged or exposed in error responses.

## 2. Nginx Configuration Hardening

- [ ] **Adopt dedicated webhook blocks**: Use the provided `nginx.conf.enterprise` with separate `location` blocks for `/api/billing/webhook` and `/api/clerk/webhook`.
- [ ] **Enable rate limiting**: Uncomment and configure `limit_req_zone` directives (requires nginx module).
- [ ] **Set proper proxy headers**: Use `$scheme` for `X-Forwarded-Proto` if nginx terminates TLS; otherwise use `$http_x_forwarded_proto`.
- [ ] **Add HSTS header**: Enable `Strict-Transport-Security` if nginx handles TLS termination.
- [ ] **Implement CSP**: Add `Content-Security-Policy` header for frontend security.
- [ ] **TLS hardening**: Configure cipher suites and protocols (e.g., via `ssl_ciphers` and `ssl_protocols`).

## 3. Backend Security and Scalability

- [ ] **Distributed rate limiting**: Move from in-memory to Redis-based rate limiting for multi-instance deployments.
- [ ] **Structured logging**: Switch to JSON logs with request IDs, correlation IDs, and centralized collection (e.g., CloudWatch, ELK stack).
- [ ] **Add request tracing**: Implement OpenTelemetry or similar for distributed tracing.
- [ ] **Webhook idempotency**: Ensure all webhooks (Stripe, Clerk) are fully idempotent across retries and multi-instance setups.
- [ ] **Input validation**: Add comprehensive validation for all API inputs, especially file uploads.
- [ ] **Error handling**: Avoid leaking sensitive info in error responses; use generic messages in production.

## 4. Infrastructure and Deployment

- [ ] **Multi-instance readiness**: Ensure the app scales horizontally (e.g., via load balancer, shared Redis for sessions/rate limits).
- [ ] **Database connection pooling**: Verify `DB_MAX_CONNECTIONS` and pooling settings for high load.
- [ ] **Backup and recovery**: Implement automated DB backups and test restore procedures.
- [ ] **Monitoring and alerting**: Set up application metrics (e.g., via Prometheus), error alerting, and webhook delivery monitoring.
- [ ] **CI/CD pipeline**: Automate deployments with security scanning, secret injection, and rollback capabilities.
- [ ] **Compliance audits**: Run security scans (e.g., Snyk, OWASP ZAP) and address findings.

## 5. Observability and Maintenance

- [ ] **Health checks**: Enhance `/api/health` with dependency checks (DB, Redis, external APIs).
- [ ] **Metrics collection**: Track webhook latency, success rates, and API usage.
- [ ] **Log retention**: Implement log rotation and secure retention policies.
- [ ] **Dependency updates**: Automate security patches for npm packages and base images.
- [ ] **Performance monitoring**: Profile API endpoints and optimize slow paths (e.g., file processing).

## 6. Testing and Validation

- [ ] **Load testing**: Simulate high webhook volumes and concurrent API requests.
- [ ] **Chaos engineering**: Test failure scenarios (e.g., DB downtime, webhook retries).
- [ ] **Security testing**: Conduct penetration testing and vulnerability assessments.
- [ ] **Compliance validation**: Ensure GDPR, PCI-DSS, or other relevant standards are met.

## Next Steps

1. Start with secrets management and rotation.
2. Update nginx config to the enterprise version.
3. Implement structured logging and monitoring.
4. Schedule regular security audits and dependency updates.

This checklist is not exhaustive — adapt to your specific enterprise requirements and consult security experts for critical systems.
