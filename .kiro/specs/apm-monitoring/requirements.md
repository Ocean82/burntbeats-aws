# Requirements Document

## Introduction

Add Application Performance Monitoring (APM) and error tracking to the Burnt Beats production stack using Sentry. This covers the React frontend, Node.js/Express backend, and Python FastAPI stem service. The goal is to capture unhandled exceptions, performance traces, and provide visibility into production issues across all three services with correlated distributed tracing.

## Glossary

- **Sentry**: An open-source error tracking and performance monitoring platform that captures exceptions, transactions, and spans across services.
- **DSN**: Data Source Name — a Sentry-specific URL that identifies the project and directs events to the correct Sentry instance.
- **Frontend**: The React 19 / TypeScript / Vite 7 single-page application served as static assets via nginx.
- **Backend**: The Node.js/Express API server running in Docker (backend/ directory).
- **Stem_Service**: The Python FastAPI service that performs AI stem separation, running in Docker (stem_service/ directory).
- **Transaction**: A Sentry performance trace representing a single logical operation (e.g., an HTTP request from start to finish).
- **Span**: A timed sub-operation within a transaction (e.g., a database query or external HTTP call within a request).
- **Sample_Rate**: The fraction of events (0.0 to 1.0) that are actually sent to Sentry, controlling volume and cost.
- **Source_Map**: A file that maps minified/bundled JavaScript back to original source code, enabling readable stack traces.
- **Environment_Tag**: A label (e.g., "production", "development") attached to Sentry events to distinguish deployment contexts.
- **Release_Tag**: A version identifier attached to Sentry events to correlate errors with specific deployments.

## Requirements

### Requirement 1: Frontend Error Tracking

**User Story:** As a developer, I want unhandled JavaScript exceptions in the browser to be captured and reported to Sentry, so that I can identify and fix production bugs without relying on user reports.

#### Acceptance Criteria

1. WHEN the Frontend application initializes, THE Frontend SHALL initialize the Sentry SDK before rendering the React component tree.
2. WHEN an unhandled JavaScript exception occurs in the browser, THE Frontend SHALL capture the exception and send it to Sentry with a stack trace.
3. WHEN a React component throws during rendering, THE Frontend SHALL capture the error via a Sentry error boundary and report it with component context.
4. THE Frontend SHALL include the Environment_Tag and Release_Tag with every captured event.
5. IF the VITE_SENTRY_DSN environment variable is not set, THEN THE Frontend SHALL skip Sentry initialization and operate without error tracking.
6. THE Frontend SHALL upload Source_Maps to Sentry during the production build so that stack traces reference original TypeScript source.

### Requirement 2: Frontend Performance Monitoring

**User Story:** As a developer, I want visibility into frontend performance (page loads, navigation, long tasks), so that I can detect and fix slowdowns that affect user experience.

#### Acceptance Criteria

1. WHEN the Sentry SDK initializes on the Frontend, THE Frontend SHALL enable browser tracing with a configurable traces Sample_Rate.
2. WHEN a page load occurs, THE Frontend SHALL capture a performance transaction including Web Vitals (LCP, FID, CLS).
3. WHEN a client-side navigation occurs, THE Frontend SHALL capture a navigation transaction.
4. THE Frontend SHALL set the default traces Sample_Rate to 0.1 in production to control event volume.

### Requirement 3: Backend Error Tracking

**User Story:** As a developer, I want unhandled exceptions in the Node.js backend to be captured and reported to Sentry, so that I can detect API failures in production.

#### Acceptance Criteria

1. WHEN the Backend process starts, THE Backend SHALL initialize the Sentry SDK before mounting Express middleware.
2. WHEN an unhandled exception occurs in an Express route handler, THE Backend SHALL capture the exception and send it to Sentry with request context (method, URL, headers).
3. WHEN an unhandled promise rejection occurs in the Backend process, THE Backend SHALL capture the rejection and send it to Sentry.
4. THE Backend SHALL include the Environment_Tag and Release_Tag with every captured event.
5. IF the SENTRY_DSN environment variable is not set, THEN THE Backend SHALL skip Sentry initialization and operate without error tracking.
6. THE Backend SHALL strip sensitive headers (Authorization, Cookie, x-api-key) from request context before sending to Sentry.

### Requirement 4: Backend Performance Monitoring

**User Story:** As a developer, I want visibility into backend API response times and bottlenecks, so that I can detect slowdowns in stem splitting, billing, and auth flows.

#### Acceptance Criteria

1. WHEN the Sentry SDK initializes on the Backend, THE Backend SHALL enable tracing with a configurable traces Sample_Rate.
2. WHEN an HTTP request is received by the Backend, THE Backend SHALL capture a performance transaction spanning the full request lifecycle.
3. THE Backend SHALL set the default traces Sample_Rate to 0.2 in production.
4. WHEN the Backend makes an outbound HTTP request to the Stem_Service, THE Backend SHALL propagate trace context headers so that traces are correlated across services.

### Requirement 5: Stem Service Error Tracking

**User Story:** As a developer, I want unhandled exceptions in the Python stem service to be captured and reported to Sentry, so that I can detect ML inference failures and service errors.

#### Acceptance Criteria

1. WHEN the Stem_Service process starts, THE Stem_Service SHALL initialize the Sentry SDK during FastAPI lifespan startup.
2. WHEN an unhandled exception occurs in a FastAPI route handler, THE Stem_Service SHALL capture the exception and send it to Sentry with request context.
3. WHEN a background job (stem separation or expand) fails with an unhandled exception, THE Stem_Service SHALL capture the exception and send it to Sentry with the job_id as context.
4. THE Stem_Service SHALL include the Environment_Tag and Release_Tag with every captured event.
5. IF the SENTRY_DSN environment variable is not set, THEN THE Stem_Service SHALL skip Sentry initialization and operate without error tracking.

### Requirement 6: Stem Service Performance Monitoring

**User Story:** As a developer, I want visibility into stem separation job durations and service performance, so that I can detect inference slowdowns and capacity issues.

#### Acceptance Criteria

1. WHEN the Sentry SDK initializes on the Stem_Service, THE Stem_Service SHALL enable tracing with a configurable traces Sample_Rate.
2. WHEN an HTTP request is received by the Stem_Service, THE Stem_Service SHALL capture a performance transaction spanning the full request lifecycle.
3. WHEN a stem separation job executes, THE Stem_Service SHALL create a child span capturing the job duration, stem count, and quality mode.
4. THE Stem_Service SHALL set the default traces Sample_Rate to 0.3 in production to capture a meaningful sample of ML inference performance.
5. WHEN the Stem_Service receives a request with trace context headers, THE Stem_Service SHALL continue the distributed trace from the Backend.

### Requirement 7: Configuration and Deployment

**User Story:** As a developer, I want APM configuration managed through environment variables and Docker Compose, so that monitoring can be enabled/disabled without code changes and secrets stay out of source control.

#### Acceptance Criteria

1. THE Backend SHALL read the Sentry DSN from the SENTRY_DSN environment variable.
2. THE Stem_Service SHALL read the Sentry DSN from the SENTRY_DSN environment variable.
3. THE Frontend SHALL read the Sentry DSN from the VITE_SENTRY_DSN environment variable (baked in at build time).
4. THE docker-compose.yml SHALL pass SENTRY_DSN to both the Backend and Stem_Service containers.
5. THE docker-compose.yml SHALL pass VITE_SENTRY_DSN as a build argument to the Frontend container.
6. THE .env.example files SHALL document the SENTRY_DSN variables with placeholder values.
7. IF a service has Sentry initialized, THEN THE service SHALL tag events with the service name (frontend, backend, stem-service) to distinguish sources in the Sentry dashboard.

### Requirement 8: Privacy and Data Filtering

**User Story:** As a developer, I want to ensure that sensitive user data (auth tokens, API keys, PII) is not sent to Sentry, so that monitoring does not create a data privacy risk.

#### Acceptance Criteria

1. THE Backend SHALL configure Sentry to strip Authorization, Cookie, and x-api-key headers from captured request data.
2. THE Frontend SHALL configure Sentry to not capture user IP addresses by default.
3. THE Stem_Service SHALL configure Sentry to strip the X-Stem-Service-Token header from captured request data.
4. WHEN the Frontend captures an error, THE Frontend SHALL not include the Clerk session token or Stripe publishable key in breadcrumb data.
