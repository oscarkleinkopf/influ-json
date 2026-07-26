# influ-JSON Phase 3 & Usability Implementation Plan

## Overview
This plan defines the step-by-step orchestration to complete requirements R1, R2, and R3 for influ-JSON.

## Milestones & Iteration Strategy

### Milestone 1 (M1): F3 Global Queue System & Rate Limit Handling (R1)
1. **Explore**: Spawn Explorer to analyze current `gen-queue.js`, `ai-service.js`, `server.js`, `app.js`, and identify all image generation paths.
2. **Implement**: Spawn Worker to:
   - Ensure all image generation calls (portrait, traditional variants, spicy variants) route through `gen-queue.js`.
   - Implement HTTP 429 rate limit detection and 30s cooldown (`RATE_LIMIT_COOLDOWN_MS`) with automatic task retry in `gen-queue.js`.
   - Add `GET /api/queue-status` endpoint in `server.js` exposing `genQueue.getStatus()`.
   - Add queue status polling and user notifications ("Encolado (Posición N)", "Servidor congestionado, enfriando X seg...") in `app.js` and `index.html`.
   - Run tests to verify build/tests pass.
3. **Review**: Spawn 2 Reviewers to verify queue implementation, HTTP 429 handling, endpoint accuracy, and UI status updates.
4. **Challenge**: Spawn Challenger to execute queue stress tests, concurrent request handling, and simulated 429 responses.
5. **Audit**: Spawn Forensic Auditor to verify code integrity (no fake mocks or hardcoded returns).

### Milestone 2 (M2): Influencer Multi-Image Import & Background Variants (R2)
1. **Explore**: Spawn Explorer to analyze current import modal, multi-image upload handling, persona creation, SQLite/personas.json persistence, and variant rendering.
2. **Implement**: Spawn Worker to:
   - Update import modal in `index.html` and `app.js` to support up to 4 image uploads with counter "X/4 cargadas" and visual previews.
   - Implement background variant generation (2 traditional + 2 spicy) triggered immediately upon persona creation/import.
   - Persist generated variants into SQLite (`db.js`) and `personas.json`.
   - Update vault view automatically without requiring full page reload when background variants complete.
   - Verify build and tests pass.
3. **Review**: Spawn 2 Reviewers to verify multi-image import UI, background variant creation, persistence, and live UI update.
4. **Challenge**: Spawn Challenger to stress test multi-image import and concurrent background variant generation.
5. **Audit**: Spawn Forensic Auditor to verify code integrity.

### Milestone 3 (M3): Usability, JSON Schema Validation & Personality Consistency (R3)
1. **Explore**: Spawn Explorer to inspect JSON schema of personas, validation routines, MBTI/voice/brand taboos integration in prompts, and chatbot export pack logic.
2. **Implement**: Spawn Worker to:
   - Create/integrate JSON schema validator for persona creation/import to prevent undefined values or corruption.
   - Enhance prompt generator and `buildFreeChatbotPack` in `app.js` and `ai-service.js` to incorporate MBTI, voice tone, distinctive traits, and brand taboos.
   - Run comprehensive test suite.
3. **Review**: Spawn 2 Reviewers to inspect schema validation and chatbot prompt pack consistency.
4. **Challenge**: Spawn Challenger to test invalid JSON inputs, edge cases, and prompt attribute inclusion.
5. **Audit**: Spawn Forensic Auditor to perform full integrity check across all milestones.

## Final Verification & Victory Claim
- Aggregate test results and audit reports across all 3 milestones.
- Ensure 100% test pass rate and clean Forensic Auditor verdict.
- Send victory report to Sentinel.
