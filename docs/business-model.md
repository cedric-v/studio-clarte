# Business model & billing — implementation proposal

> Status: **proposal** — Phase 0 (marketing) is shipped on the landing page
> (`studio-clarte-website`). Phase 1+ is to implement, in THIS repo (the
> Workers app) — see "Where the code lives" below.

---

## 1. Where the code lives (and why)

| Concern | Repo | Why |
|---|---|---|
| **Pricing page / marketing** | `studio-clarte-website` (static, `/public`) | Pure content — already shipped: `#pricing` section (EN/FR), JSON-LD offers, CTA. Honest status: managed plan marked **"Coming soon" + GitHub-issue waitlist** (no backend needed). |
| **Billing engine** (Stripe, entitlements, trial, gating) | **`studio-clarte`** (Astro SSR on Cloudflare **Workers**) | A static Pages site has no backend. Payment flows, webhooks, per-tenant entitlement checks and the read-only gate all need the Worker runtime + the existing `KV` binding and `middleware.ts` host-based router. |

So: **the business part is NOT coherent on the static website beyond the pricing
page** — the engine goes here, and the landing just sells it.

---

## 2. Pricing (decided — Unfreez-style, adapted to OSS)

| Tier | Price | Who pays | Status |
|---|---|---|---|
| **Self-hosted** | Free (BSD 3-Clause) | — | Shipped today |
| **Managed — per site** | **CHF 99 / site / year** (HT) | The **client**, via an activation link sent by the agency/dev (margin stays theirs) | Phase 1 |
| **Managed — agency flat** (optional) | CHF 49–99 / month for a site quota | The agency (single invoice, they re-bill their clients) | Phase 2 |
| **Onboarding / setup** (optional — only if you want help with it) | CHF 150–300 / site | The client (invoiced manually via Stripe Payment Link — no code) | Phase 0.5 |

Core UX rule, borrowed from Unfreez: **free trial on every site, no card. If the
client stops paying, the editing layer "refreezes" (read-only). The site, the
repo and all past commits stay untouched — no hostage-taking.**

---

## 3. Data model

Entitlements are **per site** (the product is multi-tenant by design) and keyed
in the **existing KV namespace** (already bound as `KV`). KV is enough for
read-mostly checks; switch to D1 only if agency reporting (list of sites under
one account) becomes a need.

```
billing:{siteId} → {
  status:        "trial" | "active" | "past_due" | "cancelled" | "none",
  plan:          "per-site" | "agency",
  trialEnd:      <ISO date> | null,          // 14 days from activation
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,       // per-site yearly subscription
  periodEnd:     <ISO date> | null           // next renewal / grace end
}
```

`siteId` resolves from the request host — already done in
`src/config/sites.ts` + `src/middleware.ts` (host-based router). No code change
to tenant resolution.

---

## 4. Flows

### 4.1 Activation (trial) — Phase 1
1. Super-Admin (agency domain) clicks **"Activate a site"** on the managed
   instance → `POST /api/billing/activate { siteId }`.
2. Worker sets `billing:{siteId}` → `status: "trial"`, `trialEnd: +14d`,
   returns a **short unguessable activation token** (same pattern as the
   existing `/api/draft/:token`, KV-backed, TTL).
3. Admin sends the client a link: `https://studio.client-a.ch/activate?token=…`.
   The client clicks it, lands on the white-labeled studio, signs in with
   GitHub, and gets the full experience immediately — **no card**.
4. On `trialEnd`, entitlement becomes `expired` → studio shows the
   **"Activate your site"** screen with a Stripe Checkout button.

### 4.2 Payment — Phase 1
- `POST /api/billing/checkout { siteId }` → creates a Stripe
  **Checkout Session** (mode `subscription`, the CHF 99/year Price, customer =
  client email) → returns the URL. Stripe **Tax** is enabled from day 1
  (EU OSS / Swiss VAT — the price is HT).
- Webhook `checkout.session.completed` → set `status: "active"`,
  `periodEnd: +1y`, store customer/subscription ids.
- Webhook `customer.subscription.deleted` / `invoice.payment_failed`
  (after grace) → `status: "past_due"` (7-day grace) then `"cancelled"`.

### 4.3 Gating ("the refreeze") — Phase 1
In `src/middleware.ts`, right after the existing auth guard (line ~139):
- `status ∈ {trial, active}` → full access.
- `status ∈ {past_due, cancelled, none}` → **read-only**:
  - Block (401 + friendly JSON/redirect): `/api/chat`, `/api/commit-draft`,
    `/api/merge`, `/api/restore`, `/api/upload-url`, `POST /api/settings/keys`.
  - Keep: reading, diff, history, previews, login.
  - Inject a billing banner via the existing i18n dictionary
    (`src/i18n/`) with a "Resume subscription" button (Checkout Session with
    `customer` → portal / re-checkout).
- The **agency site itself** (`isAgency: true`) is never gated — it's the
  admin surface (this also matches the current "global fallback keys for the
  agency site" convention).

### 4.4 Agency flat plan — Phase 2 (only if demand)
- One subscription per agency account; entitlement = account active → all its
  sites active. KV key `billing:agency:{accountId}` with a `sites[]` array,
  or D1 if site listing is needed.
- Single invoice, single dunning. Admin can add/remove sites from the quota.

---

## 5. Config & secrets

`wrangler.jsonc.example` additions (plain vars are version-baked — must live in
the local gitignored file, per the existing convention):

```jsonc
"vars": {
  // …existing…
  "STRIPE_PRICE_ID": "price_…",        // CHF 99/year per-site (Stripe dashboard)
  "STRIPE_TAX_ENABLED": true,
  "TRIAL_DAYS": 14,
  "PAYMENT_GRACE_DAYS": 7
}
```

Secrets via `wrangler secret put` (survive deploys — same convention):
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

---

## 6. Rollout phases

| Phase | What | Effort | Trigger |
|---|---|---|---|
| **0** | Landing pricing + waitlist (shipped: `studio-clarte-website`) | done | — |
| 0.5 | Manual onboarding fee via Stripe Payment Link (no code) | 1 h | First paying request |
| **1** | Per-site managed billing: activate → trial → checkout → webhooks → KV entitlements → read-only gate | ~1–2 weeks | ≥ 3 waitlist signups |
| **2** | Agency flat plan + dunning emails + customer portal | ~1 week | A second agency asks |
| 3 | Self-serve signup (OAuth app install, Pages project provisioning) | big | Probably **never** — agency-mediated onboarding is the product's DNA |

---

## 7. Open questions

1. **CHF 99 vs CHF 90 vs CHF 149 / year** — validate against Unfreez
   (€90, EUR) and the waitlist feedback once it exists.
2. **Annual only** at launch (yes — simpler billing, matches Unfreez). Monthly
   per-site later if requested.
3. **Trial without card** — confirmed as the default. Stripe `trial` support
   on subscriptions could automate `trialEnd` (replaces manual KV logic) — TBD
   during implementation.
4. **Stripe Tax** (EU OSS) — enable from day 1; the "HT" price on the landing
   must be explicit in the checkout copy.
5. **Free tier for non-profits / personal use of the managed instance** —
   decide later; the self-host option already covers it.

---

## 8. Related docs

- `docs/architecture.md` — system architecture, KV usage, middleware routing.
- `src/middleware.ts` — where the entitlement gate hooks in (auth guard ~line 139).
- `src/config/sites.ts` — tenant registry (`isAgency`, `SITE_DOMAINS`).
- `studio-clarte-website/public/index.html` + `/fr/index.html` — shipped pricing
  section (Phase 0).
