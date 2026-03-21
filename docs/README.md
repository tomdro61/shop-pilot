# ShopPilot Documentation

## Interactive Architecture Explorer

Open [`architecture-explorer.html`](architecture-explorer.html) in a browser to explore the full system interactively.

**5 views:**
1. **System Map** — 8 services with env vars, key files, and connection graph
2. **Data Flows** — Animated step-by-step traces of Job/Payment, Parking, and AI Chat workflows
3. **Database Schema** — 15 tables with columns, types, and FK relationships
4. **Business Rules** — 21 searchable/filterable rules covering timezone, caching, financial, AI safety, and more
5. **Page & API Map** — 22 pages and 8 API routes organized by group

## Documentation Plan

The full documentation plan is in [`shoppilot-documentation-plan.md`](shoppilot-documentation-plan.md). It calls for 16 documents across 5 batches. The architecture explorer (Batch 5) was built first as a standalone visual reference. Remaining batches cover:

- **Batch 1:** System overview, database schema reference, external services guide
- **Batch 2:** Business rules, AI tool catalog, financial calculations
- **Batch 3:** Deployment, environment setup, data flows
- **Batch 4:** API reference, troubleshooting, feature development guide
