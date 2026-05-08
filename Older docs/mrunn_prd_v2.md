# MruNN ERP — Product Requirements Document v2

> **Status:** Draft v2 — Revised per feedback | **Date:** 2026-04-30
> **Operator:** Solopreneur + Agentic AI Coding
> **Target Market:** Indian SMBs (Trading, Law, Manufacturing)

---

## 1. Strategic Intent

### 1.1 Problem Statement
Indian SMBs manage critical business operations through fragmented WhatsApp groups, Excel sheets, and disconnected accounting software (Tally). This creates data silos, missed follow-ups, compliance risks, and zero real-time visibility into business state.

### 1.2 Objective
Build a **chat-native, AI-agent-orchestrated ERP** that fits into the user's existing communication habits (WhatsApp/Telegram), automates repetitive workflows, and provides a single dashboard for understanding business state — while keeping Tally as the accounting backbone.

### 1.3 Success Metrics
| Metric | Phase 0 | Phase 1 | Phase 2 |
|--------|---------|---------|---------|
| Clients | 1 demo | 1-2 paying | 5-8 paying |
| Time saved per user/day | Demonstrate 10x | Measure 2+ hrs | 3+ hrs |
| Monthly revenue | $0 | ₹5-10K ($60-120) | ₹25-50K ($300-600) |
| User satisfaction | "Impressive" | "Can't go back" | Referrals |

### 1.4 Design Philosophy
1. **"The Chat IS the ERP"** — Every action possible via natural language
2. **"Dashboard for Trust"** — Visual proof that data is real, not a chatbot trick
3. **"Proactive, Not Reactive"** — System tells the user what needs attention before they ask
4. **"Zero Friction"** — No training needed; feels like texting a smart assistant
5. **"Tally is Sacred"** — Never replace Tally; bridge to it seamlessly
6. **"Slot In, Don't Flip"** — Fit into the client's existing workflows; we automate and streamline, we don't reorganize their business
7. **"Draft → Confirm → Commit"** — Every consequential action (money, emails, status changes) follows a mandatory draft-review-confirm cycle. Nothing goes out or gets committed without the user's explicit approval

---

## 2. Architecture

### 2.1 Three-Layer Hybrid Design

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: INTERACTION (Hermes Agent — Python)                    │
│                                                                 │
│ Responsibilities:                                               │
│ • Chat gateway (Telegram → WhatsApp → Web)                     │
│ • Natural language understanding + response generation          │
│ • Cron scheduling (daily digests, follow-ups, alerts)          │
│ • User's email integration (Gmail OAuth / SMTP)                │
│ • Learning loop (skill creation from repeated tasks)           │
│ • Notification delivery across platforms                        │
│                                                                 │
│ LLM: Gemini 3 Flash via kie.ai (fallback: Google Gemini API)  │
└──────────┬──────────────────────────────────┬───────────────────┘
           │ MCP (tool call)                  │ MCP (email tools)
           ▼                                  ▼
┌──────────────────────────────┐  ┌───────────────────────────────┐
│ LAYER 2: ORCHESTRATION       │  │ EXTERNAL MCP SERVERS          │
│ (Mastra — TypeScript)        │  │                               │
│                              │  │ • Gmail MCP (user's email)    │
│ Responsibilities:            │  │ • Shipping API MCP            │
│ • Deterministic workflows    │  │ • TallyBridge MCP (Phase 1)   │
│ • Human-in-the-loop gates    │  │ • Calendar MCP                │
│ • Multi-step business logic  │  └───────────────────────────────┘
│ • Audit trails + state mgmt  │
│ • Error recovery + retries   │
│                              │
│ Exposed as: MCP Server       │
│ (Hermes connects as client)  │
└──────────┬───────────────────┘
           │ MCP (api_discover / api_schema / api_execute)
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 3: DATA + UI (Open Mercato — TypeScript/Node.js)          │
│                                                                  │
│ Responsibilities:                                                │
│ • Entity persistence (MikroORM + PostgreSQL)                    │
│ • CRUD factory (auto-generated REST APIs)                       │
│ • Admin dashboard (widget-based, auto-generated entity views)   │
│ • Multi-tenancy (tenant_id scoping on all entities)             │
│ • RBAC (role-based access control)                              │
│ • Built-in MCP Server (api_discover, api_schema, api_execute)   │
│                                                                  │
│ Infrastructure: PostgreSQL 16 + Redis 7 + Meilisearch           │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Why Three Layers (Not Two)

| Concern | Hermes Alone? | Mastra Alone? | Hybrid |
|---------|--------------|---------------|--------|
| Chat gateway | ✅ Built-in | ❌ Need grammy | ✅ Hermes |
| Cron/scheduling | ✅ Built-in | ⚠️ Need Inngest | ✅ Hermes |
| Email (user's own) | ✅ Gmail Skill | ❌ Custom build | ✅ Hermes |
| Learning/skills | ✅ Built-in | ❌ None | ✅ Hermes |
| Deterministic workflows | ⚠️ Fragile | ✅ Graph-based | ✅ Mastra |
| Human-in-the-loop | ⚠️ Basic | ✅ Suspend/resume | ✅ Mastra |
| Audit trail | ⚠️ Logs only | ✅ State persistence | ✅ Mastra |
| Error recovery | ❌ None | ✅ Checkpointing | ✅ Mastra |

**Complexity cost:** One additional container (Mastra). Communication is standard MCP — no custom glue code.

### 2.2a Inter-Container Communication (Full Sync)

All containers run on the same Docker Compose network with DNS-based service discovery:

| Connection | Protocol | Address | Health Check |
|-----------|----------|---------|-------------|
| Hermes → Mastra | MCP over HTTP+SSE | `http://mastra:3001/mcp` | `/health` every 30s |
| Mastra → Open Mercato | MCP over HTTP+SSE | `http://mercato:4000/mcp` | `/health` every 30s |
| Hermes → Open Mercato (direct reads) | REST API | `http://mercato:4000/api` | Same health endpoint |
| All → PostgreSQL | TCP (pg protocol) | `postgres:5432` | `pg_isready` |
| All → Redis | TCP | `redis:6379` | `redis-cli ping` |

**Resilience rules:**
- Exponential backoff with circuit breaker on all inter-service calls
- Hermes retries MCP tool calls 3x before reporting failure to user
- Mastra workflows checkpoint state — resumable after container restart
- Docker Compose `depends_on` with health checks ensures correct startup order

### 2.3 Communication Flow — Draft → Confirm → Commit

> [!IMPORTANT]
> **Universal Rule:** Every action that involves money, external communication, or irreversible state changes MUST follow the Draft → Confirm → Commit pattern. The agent NEVER auto-commits.

```
User: "Create PO for 500 drums Acetic Acid from Jiangsu Chem, LC 60 days"
  │
  ▼ (Telegram)
[HERMES] Parses intent → calls Mastra MCP tool: "draft_purchase_order"
  │
  ▼ (MCP tool call)
[MASTRA] Runs workflow:
  Step 1: Validate supplier exists → api_execute(GET /contacts?name=Jiangsu)
  Step 2: Create DRAFT PO → api_execute(POST /trade/purchase-orders {status: 'draft'})
  Step 3: Return DRAFT for user review (NOT committed yet)
  │
  ▼ (MCP response — DRAFT state)
[HERMES] Formats and presents draft to user:
  "📋 DRAFT PO-2024-003:
   - 500 drums Acetic Acid
   - Supplier: Jiangsu Chemical Co.
   - Terms: LC 60 days, CIF Mumbai
   - Amount: $47,500
   
   Please review. Confirm to save to ERP?"
  │
  ▼ User: "Yes, confirm" ← GATE 1: User confirms PO
  │
[MASTRA] Commits PO → status: 'confirmed'
[AUDIT LOG] {actor: user_id, action: 'po.confirm', entity: 'PO-2024-003', timestamp}
  │
[HERMES]: "✅ PO-2024-003 confirmed and saved.
   Should I draft an email to sales@jiangsu-chem.cn with the PO details?"
  │
  ▼ User: "Yes"
  │
[HERMES] → [Mastra: draft_supplier_email]
  │
[MASTRA] Generates email draft from client's own PO template → SUSPEND
  │
[HERMES] Shows email draft in Telegram ← GATE 2: User reviews email
  │
  ▼ User: "Looks good, send it"
  │
[HERMES] Sends via Gmail Skill FROM user's own email address
[AUDIT LOG] {actor: user_id, action: 'email.send', to: 'sales@jiangsu-chem.cn', timestamp}
[HERMES] Logs interaction in Open Mercato
```

**Actions requiring Draft → Confirm → Commit:**
| Category | Examples |
|----------|----------|
| Financial | PO creation, invoice generation, payment recording, LC opening |
| Communication | Emails to suppliers/customers/clients, WhatsApp messages |
| Status changes | PO confirmation, shipment status update, case status change |
| Billing | Invoice generation, time entry billing, payment follow-ups |

**Actions that do NOT need confirmation (read-only / informational):**
| Category | Examples |
|----------|----------|
| Queries | "What POs are pending?", "Show overdue invoices" |
| Notifications | Daily digest, vessel alerts, deadline reminders |
| Logging | Auto-logging chat interactions, recording received data |

### 2.4 Hermes Learning Loop — Scope & Safety

Learning is enabled but scoped to **workflow optimization only** — never to templates, document formats, or business logic. We slot into the client's existing way of working.

**What the learning loop SHOULD learn:**
| Category | Example |
|----------|---------|
| User shorthand | "JC" → Jiangsu Chemical Co. |
| Default preferences | User always uses CIF Mumbai for Jiangsu orders |
| Communication style | User prefers email subject: "PO-XXXX \| Product \| Date" |
| Workflow patterns | Every Monday, user asks for a weekly summary |
| Data extraction | How to parse quantities/prices from user's natural phrasing |

**What the learning loop must NEVER change:**
| Category | Reason |
|----------|--------|
| PO/invoice templates | Client has existing templates they've used for years |
| Business logic | Tax calculations, status transitions, validation rules |
| Approval flows | Draft→Confirm→Commit gates are hardcoded, not learnable |
| Document formats | Client's letterhead, numbering schemes, layouts |

**Safety features:**
| Feature | How It Works |
|---------|-------------|
| **Human-readable** | Skills stored as Markdown (SKILL.md) — audit, edit, delete anytime |
| **Structured format** | Each skill has: When to Use, Procedure, Pitfalls, Verification |
| **Review gate** | New skills flagged for human approval before becoming permanent |
| **Scope isolation** | Docker container limits agent's filesystem/network reach |
| **Auto-scanning** | Defense-in-depth checks for prompt injection, data exfiltration |

---

## 3. Repository Analysis — What We Use

| Repository | Verdict | What We Take | What We Ignore |
|------------|---------|-------------|----------------|
| **Open Mercato** | ✅ CORE | Module system, CRUD factory, MCP server, admin dashboard, MikroORM, Docker Compose | None — this is our foundation |
| **Hermes Agent** | ✅ CORE | Chat gateway, cron, Gmail skill, learning loop, multi-platform support | Browser automation tools (not needed for ERP) |
| **Lambda ERP** | 🔍 PATTERN | Unified `Document` base class with Draft→Submitted→Cancelled lifecycle; metadata-driven UI shared between LLM and frontend; semantic datasets (whitelisted queries, no raw SQL); `docs/agents/` folder with LLM-readable invariants/gotchas; double-entry GL enforcement; two-model orchestration pattern | Python/FastAPI stack (we use TS); SQLite default; single-tenant design; GPT-5.4/Anthropic dependency |
| **ERPClaw/OpenClaw** | 🔍 PATTERN | SKILL.md metadata-driven concept, financial invariant checks (18 accounting invariants), self-improvement engine idea | SQLite (we use PostgreSQL), Python stack, Webclaw UI |
| **next-shadcn-dashboard-starter** | ✅ PHASE 2 | Next.js + shadcn/ui + TanStack Table + Recharts stack for custom web dashboard | Clerk auth (we use Open Mercato's built-in or Logto) |
| **Paperclip AI** | 🔍 PATTERN | Budget enforcement per agent, heartbeat scheduling concept, org-chart management mental model | CEO dashboard (overkill for our scale) |
| **Tabler** | ❌ SKIP | — | No maintained React version; Open Mercato has admin UI |
| **LiveKit agent-starter** | 📋 PHASE 3+ | Voice agent for "call your ERP" feature | Not needed for MVP |
| **public-apis** | 📋 REFERENCE | Shipping tracking APIs, currency exchange APIs catalog | Not a codebase — just reference |

> [!NOTE]
> **Lambda ERP key insight:** Their unified `Document` lifecycle (Draft→Submitted→Cancelled) with `on_submit`/`on_cancel` hooks validates our Draft→Confirm→Commit pattern. Their `docs/agents/` folder pattern (LLM-readable invariants and gotchas) should be adopted — we create a similar `docs/agents/` in our repo so Hermes/Mastra can reference business rules without hardcoding them.

**LLM Fallback Strategy:** Primary: Gemini 3 Flash via kie.ai. Fallback: Google Gemini official API direct. No third-party proxies.

---

## 4. Module Specifications

### 4.1 Core Modules (All Industries)

#### @mrunn/contacts
**Purpose:** Unified people/company management across all verticals.

| Entity | Key Fields | Notes |
|--------|-----------|-------|
| `Organization` | name, type (supplier/customer/partner), email, phone, address, gst_number, pan | India-specific tax IDs |
| `Person` | name, org_id (FK), role, email, phone, preferred_channel | Links to org |
| `Interaction` | person_id, type (email/call/chat), summary, date | Auto-logged by Hermes |

**Agent Tools:** `find_contact`, `create_contact`, `update_contact`, `log_interaction`
**Dashboard Widgets:** Contact count by type, recent interactions timeline

---

#### @mrunn/comms
**Purpose:** Centralized communication tracking and outbound messaging.

| Capability | Implementation |
|-----------|---------------|
| Email (user's own) | Hermes Gmail Skill (OAuth2, auto-refresh tokens) |
| Email (autonomous) | AgentMail MCP for auto-notifications (optional Phase 2) |
| Telegram | Hermes built-in gateway |
| WhatsApp | Hermes built-in gateway (Phase 2, WhatsApp Cloud API) |
| Templates | Stored in Open Mercato, rendered by Mastra workflows |

**Key Workflow:** Draft → Present to User → Confirm → Send → Log

**Acceptance Criteria:**
- [ ] User can say "email [contact] about [topic]" and receive a draft
- [ ] Draft shown in chat for review before sending
- [ ] Email sent FROM user's actual email address (not a bot)
- [ ] Sent email logged as Interaction in @mrunn/contacts

---

#### @mrunn/dashboard
**Purpose:** Visual business state — the "proof of reality."

| Widget Type | Examples |
|------------|---------|
| KPI cards | Total POs this month, Outstanding payments, Active cases |
| Charts | PO volume over time (line), Payment status (donut), Revenue by client (bar) |
| Tables | Pending items list, Overdue follow-ups, Recent activity |
| Alerts | Items needing attention (overdue, expiring, approaching deadlines) |

**Technical:** Open Mercato's built-in `POST /dashboards/widgets/data` API with date ranges and period comparisons.

---

#### @mrunn/documents
**Purpose:** File storage, templates, and attachment management.

| Entity | Key Fields |
|--------|-----------|
| `Document` | name, type, file_url, linked_entity_type, linked_entity_id, version |
| `Template` | name, category (PO/Invoice/Legal), body_template, variables |

**Phase 0:** MinIO or S3-compatible storage. Templates as Markdown with variable interpolation.

---

#### @mrunn/tasks
**Purpose:** Follow-ups, assignments, and deadline tracking.

| Entity | Key Fields |
|--------|-----------|
| `Task` | title, description, assigned_to, due_date, status, priority, linked_entity |
| `Reminder` | task_id, remind_at, channel (telegram/email/whatsapp), sent |

**Agent Automation:** Hermes cron checks daily for overdue tasks → sends reminders via preferred channel.

---

### 4.2 Trading Module (Chemicals/Cloth)

#### @mrunn/trade
**Purpose:** Core purchase/sales order lifecycle management.

| Entity | Key Fields |
|--------|-----------|
| `PurchaseOrder` | po_number (auto), supplier_id (FK), items (JSON), incoterm, payment_terms, currency, total_amount, status, created_by |
| `POLineItem` | po_id, product_name, quantity, unit, unit_price, hsn_code |
| `SalesOrder` | so_number, customer_id, items, terms, status |
| `Invoice` | invoice_number, linked_po_or_so, amount, due_date, status (draft/sent/paid/overdue) |
| `Payment` | invoice_id, amount, date, method, reference_number |

**Statuses (enforced, no skipping):**
```
draft → confirmed → shipped → received → invoiced → paid → closed
  │                                                           │
  └──── cancelled (from any state except 'paid' or 'closed') ─┘
```
*Inspired by Lambda ERP's Document lifecycle. `on_confirm` and `on_cancel` hooks trigger side-effects (audit log, notifications).*

**Agent Tools (exposed via Mastra workflows):**
```
draft_purchase_order(supplier, items, terms) → DRAFT PO (requires user confirm)
confirm_purchase_order(po_id) → Committed PO
update_po_status(po_id, new_status) → updated PO (requires confirm for consequential changes)
list_purchase_orders(filters: {status, supplier, date_range}) → PO[]
draft_invoice(po_id) → DRAFT Invoice (requires user confirm)
record_payment(invoice_id, amount, reference) → Payment (requires user confirm)
get_pending_actions() → {overdue_invoices, pending_pos, expiring_lcs}
```

**Acceptance Criteria:**
- [ ] "Create PO for 500 drums Acetic Acid from Jiangsu Chem" → PO created with auto-number
- [ ] PO visible in admin dashboard within 1 second
- [ ] "What POs are pending?" → accurate list with amounts
- [ ] Status transitions validated (can't go from draft to paid)

---

#### @mrunn/shipping
**Purpose:** Vessel tracking, Bill of Lading management, customs documentation.

| Entity | Key Fields |
|--------|-----------|
| `Shipment` | po_id, vessel_name, bl_number, container_number, port_of_loading, port_of_discharge, etd, eta, status |
| `CustomsEntry` | shipment_id, bill_of_entry_number, customs_duty, igst, status |

**Agent Automation:**
- Cron: Daily check shipping API for vessel status updates → alert on status change
- Cron: Alert 3 days before ETA for customs preparation

---

#### @mrunn/finance
**Purpose:** LC management, banking, FX tracking.

| Entity | Key Fields |
|--------|-----------|
| `LetterOfCredit` | po_id, lc_number, issuing_bank, amount, currency, expiry_date, status |
| `BankCharge` | type, amount, reference, date |
| `FXRate` | currency_pair, rate, date |

**Agent Automation:**
- Cron: Alert 7 days before LC expiry
- Cron: Daily FX rate fetch for active currencies

---

#### @mrunn/tally-bridge (Phase 1)
**Purpose:** Bidirectional sync with TallyPrime.

| Direction | What Syncs | Method |
|-----------|-----------|--------|
| Tally → MruNN (read) | Ledger balances, outstanding receivables/payables | Tally XML/HTTP API |
| MruNN → Tally (write) | Purchase vouchers, sales vouchers, payment entries | Tally XML import |

**Phase 1:** Read-only (query balances, verify entries)
**Phase 2:** Write-back (push POs as purchase vouchers)

---

### 4.3 Law Module (Phase 3)

#### @mrunn/cases
| Entity | Key Fields |
|--------|-----------|
| `Case` | case_number, title, client_id, court, judge, opposing_party, status, type (civil/criminal/corporate) |
| `Hearing` | case_id, date, court_room, purpose, notes, outcome, next_date |
| `CourtDiary` | date, hearings (nested), notes |

**Agent Automation:**
- Cron: Alert 2 days before hearing with case summary
- Cron: Weekly court diary summary
- Alert when hearing date rescheduled

---

#### @mrunn/billing
| Entity | Key Fields |
|--------|-----------|
| `TimeEntry` | case_id, lawyer_id, date, hours, description, rate, billable |
| `LegalInvoice` | client_id, case_ids, entries, subtotal, gst, total, status |

**Agent Tools:** "I worked 3 hours on the Sharma case today" → TimeEntry created, rate auto-applied.

---

#### @mrunn/legal-docs
| Entity | Key Fields |
|--------|-----------|
| `LegalDocument` | case_id, type (petition/reply/contract), version, file_url, status (draft/filed/served) |
| `DocumentTemplate` | name, type, body, variables |

**Agent Tools:** "Draft a reply to the motion in Case 456" → generates from template + case context.

---

## 5. Key User Workflows (Detailed)

### 5.1 Trading: Complete PO-to-Payment Cycle

```
DAY 1: PO Creation (Draft → Confirm → Commit)
├── User: "I need to order 500 drums of Acetic Acid from Jiangsu Chemical"
├── [Hermes] → [Mastra: draft_purchase_order]
│   ├── Step 1: Lookup supplier → found
│   ├── Step 2: Create DRAFT PO with defaults (CIF Mumbai, LC 60 days)
│   ├── Step 3: Return DRAFT for user review
├── [Hermes]: "📋 DRAFT PO-2024-003: [details]. Please review. Confirm?"
├── User: "Yes, confirm, and email it to them"         ← GATE: User confirms PO
├── [Mastra: confirm_purchase_order] → PO committed + audit logged
├── [Hermes] → [Mastra: draft_supplier_email]
│   ├── Step 1: Generate email from client's PO template
│   ├── Step 2: SUSPEND → return draft for review
├── [Hermes]: Shows email draft                         ← GATE: User reviews email
├── User: "Send it"
└── [Hermes]: Sends via Gmail Skill → audit logged → interaction logged

DAY 15: Shipment Update (no confirmation needed — informational)
├── [Hermes Cron]: Checks shipping API → vessel departed
├── [Hermes]: "🚢 Vessel MV Pearl departed Shanghai. ETA Mumbai: Feb 15."
├── Auto-creates Task: "Prepare customs documents by Feb 12"

DAY 30: Arrival + Invoice (Draft → Confirm → Commit)
├── [Hermes Cron]: Vessel arrived → alerts user
├── User: "Create invoice for PO-2024-003"
├── [Mastra: draft_invoice] → DRAFT Invoice generated
├── [Hermes]: "📋 DRAFT Invoice: [details]. Confirm?"   ← GATE: User confirms invoice
├── User: "Yes, confirm"
├── [Mastra: confirm_invoice] → Invoice committed + audit logged
├── User: "Mark as paid, reference TT-789012"
├── [Hermes]: "Record payment of $47,500 against INV-2024-009? Confirm?"
├── User: "Confirm"                                     ← GATE: User confirms payment
└── [Mastra: record_payment] → Payment recorded + audit logged, PO status → closed

DAILY: Morning Digest (Hermes Cron, 9:00 AM — no confirmation needed)
└── "📊 Good morning! Here's your summary:
     - 3 POs pending confirmation
     - 1 vessel arriving today (MV Pearl)
     - 2 invoices overdue (₹4.5L total)
     - LC-2024-007 expires in 5 days"
```

### 5.2 Law: Case Lifecycle

```
INTAKE:
├── User: "New case - Sharma vs Patel, civil suit, Delhi HC"
├── [Mastra: create_case] → Case created with auto-number

DAILY WORK:
├── User: "Spent 2 hours on Sharma case drafting reply"
├── [Mastra: log_time] → TimeEntry created at ₹5,000/hr = ₹10,000

COURT PREP:
├── [Hermes Cron]: "📋 Hearing tomorrow - Sharma vs Patel
│    Court: Delhi HC, Room 4B, 10:30 AM
│    Purpose: Arguments on interim relief
│    Documents needed: Affidavit of service"

BILLING:
├── User: "Generate invoice for Sharma case this month"
├── [Mastra: generate_invoice] → 14 hours × ₹5,000 + GST = ₹82,600
├── User: "Send to client"
└── [Hermes]: Drafts email with invoice PDF attached
```

---

## 6. Technical Constraints

### 6.1 Stack (Locked)
| Layer | Technology | Reason |
|-------|-----------|--------|
| Interaction | Hermes Agent (Python) | Built-in chat + cron + email + learning |
| Orchestration | Mastra (TypeScript) | Deterministic workflows + MCP + audit |
| Data/UI | Open Mercato (TypeScript) | Modules + CRUD + dashboard + MCP server |
| Database | PostgreSQL 16 | Open Mercato default, production-grade |
| Cache | Redis 7 | Open Mercato sessions |
| Search | Meilisearch | Open Mercato full-text (optional Phase 0) |
| LLM (primary) | Gemini 3 Flash via kie.ai | 70% cheaper than direct Google |
| LLM (fallback) | Google Gemini API (direct) | Official API if kie.ai is down |
| Email | User's Gmail (OAuth2) | Sends as the user, not a bot |
| Hosting | Oracle Free (Phase 0) → Hetzner CAX21 (Phase 1+) | Cost optimization |
| Deployment | Docker Compose on Coolify | One-click deploys, SSL, monitoring |

### 6.2 Non-Goals
- ❌ Do NOT replace Tally — bridge to it
- ❌ Do NOT build a mobile app — chat IS the mobile interface
- ❌ Do NOT build custom MCP tools — use Open Mercato's built-in
- ❌ Do NOT fork Open Mercato — extend via modules (Open-Closed Principle)
- ❌ Do NOT use LangChain/LangGraph — Mastra is cleaner for TypeScript
- ❌ Do NOT require user training — if it needs a manual, it's too complex

### 6.3 Security & Auth Roadmap

| Phase | Auth | Data Isolation | Encryption |
|-------|------|---------------|------------|
| 0 | Single user (Telegram ID) | Single tenant | TLS in transit |
| 1 | Logto (self-hosted) + Google OAuth | tenant_id on all queries, JWT | TLS + DB column encryption for PII |
| 2+ | Logto + Google OAuth + MFA | Row-level security (RLS) per org | At-rest encryption, WORM audit logs |

**SaaS Auth Architecture (Phase 1+):**
- **Provider:** Logto (open-source, self-hosted, free) — supports Google OAuth, multi-tenancy, RBAC out of the box
- **Organization model:** Each client = one Logto Organization. Users (employees) belong to an Organization with roles:
  - `owner` — full access, can invite users, manage settings
  - `operator` — create POs, send emails, manage daily operations
  - `viewer` — read-only dashboard access, receive digests
- **Google Sign-In:** Seamless "Sign in with Google" for each client and their employees. Logto handles OAuth2 flow, token management, and session persistence
- **Agent tokens:** Hermes and Mastra use M2M (machine-to-machine) tokens for inter-service auth — not user tokens
- **Phase 0 shortcut:** Telegram user ID mapped to hardcoded tenant. No Logto needed for demo

### 6.4 Financial Invariants (from ERPClaw + Lambda ERP)
- All monetary values use Decimal (never float)
- Double-entry validation: every debit has a matching credit
- Status transitions enforced via state machine (no skipping states) — Lambda ERP's `on_submit`/`on_cancel` hook pattern
- Round-off entries auto-generated for rounding gaps (Lambda ERP pattern)
- Imbalanced vouchers are rejected at the engine level, not the UI level

### 6.5 Tamper-Proof Audit Log

Every action in the system is permanently logged. This log cannot be edited or deleted by any user or admin.

**Architecture:**
- Dedicated `audit` schema in PostgreSQL, separate from application data
- Application database role has `INSERT`-only permission on audit tables — no `UPDATE`, no `DELETE`
- `DROP`/`ALTER` rights revoked for the application role

**Every audit entry captures:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique entry ID |
| `timestamp` | TIMESTAMPTZ | Server-side `NOW()`, not client-supplied |
| `actor_id` | UUID | Authenticated user who performed the action |
| `actor_name` | TEXT | Human-readable name (denormalized for fast reads) |
| `action` | TEXT | e.g., `po.draft`, `po.confirm`, `email.send`, `payment.record` |
| `entity_type` | TEXT | e.g., `PurchaseOrder`, `Invoice`, `Email` |
| `entity_id` | UUID | Primary key of affected record |
| `old_value` | JSONB | Previous state (null for creates) |
| `new_value` | JSONB | New state |
| `correlation_id` | UUID | Links related actions in a single business transaction |
| `prev_hash` | TEXT | SHA-256 hash of the previous audit entry |
| `row_hash` | TEXT | SHA-256 of (this row's data + prev_hash) — tamper-evidence chain |

**Tamper detection:** Hash chaining means if any historical entry is modified, the chain breaks and is immediately detectable via periodic verification jobs.

**Retention:** Audit logs are partitioned by month. Never deleted. Optionally archived to WORM-compliant S3 storage (Phase 2+).

**Query examples:**
- "Who approved PO-2024-003?" → `SELECT * FROM audit.log WHERE entity_id = ? AND action = 'po.confirm'`
- "What happened on April 15?" → `SELECT * FROM audit.log WHERE timestamp::date = '2024-04-15' ORDER BY timestamp`
- "Show all actions by user X" → `SELECT * FROM audit.log WHERE actor_id = ?`

### 6.6 docs/agents/ — LLM-Readable Business Rules

Inspired by Lambda ERP's `docs/agents/` folder. We maintain a set of Markdown files that both humans and LLMs can read:

| File | Contents |
|------|----------|
| `invariants.md` | Financial rules that must never be violated |
| `gotchas.md` | Known edge cases and how to handle them |
| `templates.md` | PO/email/invoice template specifications |
| `vocabulary.md` | Client-specific shorthand and terminology |
| `workflows.md` | Step-by-step flows for each business process |

Hermes and Mastra reference these files as context — ensuring consistent behavior without hardcoding business rules into application code.

---

## 7. Phased Delivery

### Phase 0: Demo (Days 1-7) — $0 cost

**Goal:** Impress the chemical trading client with a working demo.

| Day | Deliverable |
|-----|------------|
| 1 | `create-mercato-app` + define @mrunn/trade entities + deploy on Oracle/Coolify |
| 2 | Configure Hermes (Telegram + kie.ai LLM + Open Mercato MCP connection) |
| 3 | Build Mastra workflows: create_po, list_pos, update_status |
| 4 | Email flow (Gmail OAuth) + cron (daily digest) |
| 5 | Dashboard widgets + demo script rehearsal |
| 6-7 | Buffer: edge cases, prompt tuning, client-specific vocabulary |

**Demo Deliverables:**
- [x] Create PO via Telegram chat
- [x] PO visible in admin dashboard (proof of reality)
- [x] Email supplier from user's own email
- [x] Daily morning digest via Telegram
- [x] "What's pending?" query returns accurate data
- [x] Dashboard with PO status chart + KPI cards

### Phase 1: Production Trading (Weeks 2-6)

| Feature | Details |
|---------|---------|
| Multi-tenancy + Auth | tenant_id on all entities, Logto (self-hosted) + Google OAuth + JWT |
| TallyBridge (read) | Query Tally ledgers/balances via MCP |
| @mrunn/shipping | Vessel tracking + BL management |
| @mrunn/finance | LC management + FX rates |
| Hetzner hosting | CAX21 ARM server, production Coolify |
| Custom web dashboard | next-shadcn-dashboard-starter for client-facing UI |

### Phase 2: Scale (Weeks 7-12)

| Feature | Details |
|---------|---------|
| WhatsApp Cloud API | Hermes gateway (built-in support) |
| TallyBridge (write) | Push vouchers to Tally |
| @mrunn/inventory | Stock levels, batch tracking |
| Hindsight memory | Per-tenant learning isolation |
| 3-5 clients | Onboarding automation |

### Phase 3: Law + Growth (Weeks 13-20)

| Feature | Details |
|---------|---------|
| @mrunn/cases | Case management + court diary |
| @mrunn/billing | Time tracking + legal invoicing |
| @mrunn/legal-docs | Template drafting + version control |
| LiveKit voice agent | "Call your ERP" capability |
| 10+ clients | Mixed trading + law |

---

## 8. Verification & Acceptance

### Phase 0 Checklist
- [ ] `create-mercato-app` scaffolds on Oracle ARM64
- [ ] @mrunn/trade entities visible in admin dashboard
- [ ] Hermes connects to Telegram + Open Mercato MCP + Mastra MCP
- [ ] "Create PO" via chat → DRAFT shown → user confirms → PO in dashboard within 2 seconds
- [ ] "Email supplier" → draft shown → confirmed → sent from user's Gmail
- [ ] All consequential actions follow Draft → Confirm → Commit pattern (no auto-commits)
- [ ] Audit log records every PO creation, confirmation, and email send
- [ ] Cron daily digest fires at 9:00 AM IST
- [ ] Dashboard loads in under 3 seconds on mobile
- [ ] Demo script runs end-to-end without manual intervention

### Production Acceptance (Phase 1)
- [ ] User A cannot see User B's data (tenant isolation)
- [ ] TallyBridge returns accurate ledger balances
- [ ] System handles 50+ concurrent chat sessions
- [ ] 99.5% uptime over 30 days
- [ ] All monetary calculations use Decimal precision
- [ ] Audit log captures every data mutation

---

## 9. Cost Model

| Phase | Infrastructure | LLM | Total/mo | Revenue | Margin |
|-------|---------------|-----|----------|---------|--------|
| 0 | $0 (Oracle) | ~$0.50 | $0.50 | Demo | — |
| 1 | $11 (Hetzner) | ~$5 | $16 | $60-120 | 73-87% |
| 2 (5 clients) | $11 | ~$15 | $26 | $300 | 91% |
| 3 (10 clients) | $20 | ~$30 | $50 | $660+ | 92% |

---

## 10. Resolved Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| Q1 | Mastra: same container or separate? | **Separate containers** | Clean separation. Communication via MCP over HTTP+SSE on shared Docker network. See §2.2a |
| Q2 | Gmail OAuth: who sets it up? | **Our Google Cloud project (SaaS model)** | We own one OAuth app. Clients sign in via Logto + Google OAuth. Their Gmail access is granted via OAuth consent screen. Phase 0: our own Gmail for demo |
| Q3 | Hermes learning: enable? | **Yes, workflow optimization only** | Learns shorthand, preferences, patterns. Never changes templates or business logic. Review gate enabled. See §2.4 |
| Q4 | Custom dashboard timing? | **Phase 1 end / Phase 2 start** | Open Mercato admin UI for Phase 0. Custom screens coded ad-hoc if Mercato lacks them. Full next-shadcn dashboard in Phase 2 |

## 11. Open Questions

> [!IMPORTANT]
> ### Q1: Logto vs Open Mercato built-in auth
> Need to verify: does Open Mercato's built-in auth support external OAuth providers (Google)? If yes, we may not need Logto at all. If no, Logto sits in front as the auth gateway. Research needed during Phase 0 scaffolding.

> [!IMPORTANT]
> ### Q2: Hermes tenant isolation for learning
> When we go multi-tenant, each client's learned skills must be isolated. Hermes stores skills as files — we need per-tenant skill directories or a database-backed skill store. Design decision needed before Phase 1.
