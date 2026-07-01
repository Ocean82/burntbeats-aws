# 🚨 System Readiness & Technical Debt Analysis

This document synthesizes remaining gaps from various plan files (`TODO-SRE-REMAINING.md`, `priority-plan.md`, etc.). The project is feature-complete at a macro level, but system maturity requires focused attention on Stability (SRE), Test Coverage, and Architectural Polish.

## 🎯 Priority Pillars for Completion

The work must be structured around three pillars: **I. Immediate Reliability (SRE)**, **II. Core Feature Expansion** (Beat Maker/MIDI UI), and **III. Code Quality & Maintainability.**

---

### I. 🔥 High-Priority Reliability & Operations (The 'Must Fix' List)

These items directly impact system stability, observability, or compliance.

#### 1. [Critical] Service Observability & Monitoring Setup
*   **Gap:** APM/monitoring dashboards are missing in Prometheus/Grafana. While Sentry is integrated, actionable metrics for core services (especially billing and beat generation) are absent.
*   **Action:** Implement key business and technical metrics: request rates, latency distribution (P95, P99), error types per endpoint, queue depth tracking (`stem_service`).
*   **Reference:** `jobs added to stem_service queue_depth metric` is an example of this type of work.

#### 2. [High] End-to-End Test Coverage (Playwright)
*   **Gap:** Frontend integration tests for critical workflows are missing, specifically the billing checkout and MIDI/stem split happy path.
*   **Action:** Implement comprehensive Playwright E2E suite covering: 
    1.  Billing/Subscription Flow (Checkout, Payment Failure, Retry).
    2.  Content Creation Workflow (MIDI input $\rightarrow$ Stem Split/Processing). This validates the core feature chain.
*   **Reference:** `⚠️ Frontend integration tests... still needed`

#### 3. [Medium] Operational Resilience & Edge Cases
*   **Gap A (SRE):** Final verification of critical data flows, particularly Correlation ID propagation for debugging across services.
    *   *Action:* Implement and test mandatory correlation/trace IDs across API boundaries.
*   **Gap B (UI/Client):** Address client-side lifecycle events crucial for user trust.
    *   *Action 1:* Skeleton loading on `PricingPage` must be implemented.
    *   *Action 2:* Auditing and consistent implementation of `tap-feedback` class across *all* primary CTAs (e.g., button hover/active states).

---

### II. ✨ Medium-Priority Feature Expansion & Architecture (The 'Build Next' List)

These items expand the product's core functionality and refine the user experience.

#### 4. [High] Beat Maker Engine Development
*   **Gap:** Phases 3 and 4 of the rhythm engine are unbuilt, severely limiting advanced music production capabilities.
*   **Action (P3):** Implement backend rhythm API (`POST /rhythm/generate` in `midi_service/routes/rhythm.py`). Focus on generating variations and exporting complex patterns.
*   **Action (P4):** Develop the pattern chaining logic (multi-bar arrangement view, chain export). This moves the tool from sequence creation to full arrangement capability.

#### 5. [High] Advanced MIDI UI Polish & UX Refinement
*   **Gap:** The primary MIDI processing workflow UI requires significant polish and state management improvements beyond the core functionality buildout.
*   **Action (UX/Animation):** Implement global motion passes using Framer Motion (`AnimatePresence`, staged animations).
*   **Action (Polish):** Redesign `WorkflowStepper` for a more animated, intuitive progression. 
    *   Upgrade the multi-stage progress indicators in `MidiConvertProgress`. 
    *   Replace native `<audio>` with a custom player component (`MidiSourcePreview`) to maintain consistent styling and behavior.
*   **Impact:** This elevates the user experience from 