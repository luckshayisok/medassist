# MedAssist — Architecture & Implementation Plan

> Guiding question for every screen: **"What does the patient need to do right now?"**
> MedAssist helps patients follow an existing plan. It never changes treatment.

---

## 1. Product architecture

```
┌──────────────────────┐        HTTPS/JSON         ┌──────────────────────────┐
│  Mobile app (Expo)   │ ────────────────────────▶ │  API (Node + Express)    │
│  Patient / Caregiver │ ◀──────────────────────── │  Auth · Meds · Logs · AI │
│                      │                           └──────┬─────────┬─────────┘
│  Local SQLite cache  │                                  │         │
│  Local notifications │                     ┌────────────▼──┐  ┌───▼──────────────┐
│  Secure token store  │                     │  PostgreSQL   │  │ Object storage   │
└──────────┬───────────┘                     │  + pgvector   │  │ (private S3/R2)  │
           │ push (caregiver alerts)         └───────────────┘  └──────────────────┘
           ▼                                          │
   Expo Push / FCM / APNs              ┌──────────────▼──────────────┐
                                       │ AI services                  │
                                       │  • Vision/OCR extraction     │
                                       │  • LLM (assistant)           │
                                       │  • Embeddings (RAG)          │
                                       └─────────────────────────────┘
```

Bounded contexts: **Identity** (users, caregivers, consent) · **Medication plan** (meds, schedules) ·
**Adherence** (dose events, logs, stats) · **Prescriptions** (images, OCR, extraction, verification) ·
**Knowledge** (verified drug info + sources) · **Assistant** (chat, safety layer) · **Notifications**.

Key product decisions
- **Local-first reminders.** Every dose reminder is a *local* notification scheduled on the device. The
  server is never on the critical path for "remind me at 8:00".
- **Nothing activates without a human.** OCR/AI output is a *draft*; a patient/caregiver must verify.
- **Provenance everywhere.** Each piece of info shown is tagged: `prescription` · `verified` (with source) ·
  `general` · `ai-explanation`.

## 2. Mobile architecture

| Concern | Choice |
|---|---|
| Framework | Expo SDK (latest stable), React Native, TypeScript (strict) |
| Navigation | Expo Router — `(auth)`, `(tabs)`, modal routes for reminder / scan |
| UI | shadcn/ui for React Native (React Native Reusables) + NativeWind 4 / Tailwind 3; tokens in `global.css`, rem-scaled text sizes, `.dark` = high-contrast mode |
| Server state | TanStack Query (persisted to local storage for offline reads) |
| Client state | Zustand (settings: font scale, contrast, role; session) |
| Local DB | `expo-sqlite` — meds, schedules, dose events, outbox queue |
| Secure storage | `expo-secure-store` (Keychain / Android Keystore) for tokens |
| Notifications | `expo-notifications` (local scheduling, categories/actions, push token) |
| Camera / images | `expo-camera`, `expo-image-picker`, `expo-image-manipulator` (crop/compress) |
| Network | `@react-native-community/netinfo` → triggers sync |
| Speech | `expo-speech` ("Read aloud" on reminder screen) |

Layering: **screens (app/)** → **hooks/** (compose queries + stores) → **services/** (api, notifications,
sync, storage — no React) → **utils/** (pure: schedule expansion, adherence math). Business logic is pure
TypeScript and unit-tested without React.

## 3. Backend architecture

- **Node 22 + Express 5 + TypeScript**, layered: `routes → controllers → services → repositories (Prisma)`.
- **Prisma ORM** on PostgreSQL 16, `pgvector` extension for RAG embeddings.
- **Zod** validation for every request body/params/query.
- Middleware: `helmet`, CORS allow-list, `express-rate-limit` (strict on `/auth`, `/assistant`, uploads),
  request-id, pino logger with redaction, central error handler (no stack traces to clients).
- **Authorization helper** `assertPatientAccess(user, patientId, permission)` used by every patient-scoped
  route: patient = self, caregiver = active relationship with that permission, else 403/404.
- Jobs (BullMQ + Redis, or pg-boss to avoid Redis): prescription processing, missed-dose detection for
  caregiver alerts, knowledge ingestion.
- Deploy: Docker → Render/Railway/Fly/AWS ECS; managed Postgres (Neon/Supabase/RDS); Cloudflare R2 / S3.

## 4. Database schema (PostgreSQL via Prisma)

See `backend/prisma/schema.prisma` for the authoritative version. Summary:

| Table | Key columns | Notes |
|---|---|---|
| `User` | id (uuid), name, email (unique, citext), passwordHash, role (`PATIENT`/`CAREGIVER`), timezone | |
| `PatientProfile` | userId (unique FK), dateOfBirth, preferences jsonb, accessibilitySettings jsonb, emergencyContact | 1:1 User |
| `CaregiverRelationship` | caregiverId, patientId, status (`PENDING`/`ACTIVE`/`REVOKED`), permissions text[] | unique(caregiverId, patientId) |
| `Medication` | patientId, name, dosage, unit, doseQuantity, imageKey, instructions, foodTiming enum, foodInstructions, avoidInstructions, startDate, endDate, prescriber, notes, active, deletedAt, version | soft delete; `version` for sync conflicts |
| `MedicationSchedule` | medicationId, timeOfDay (`HH:mm`, patient local), frequency enum, daysOfWeek int[], intervalDays, startDate, endDate | wall-clock time + patient tz ⇒ DST-safe |
| `MedicationLog` | medicationId, patientId, scheduleId, scheduledFor (timestamptz), takenAt, status enum, skipReason, snoozedUntil, loggedBy, clientId (uuid) | **unique(scheduleId, scheduledFor)** ⇒ idempotent; unique(clientId) |
| `Prescription` | patientId, imageKey, ocrText, status (`UPLOADED`/`PROCESSING`/`NEEDS_REVIEW`/`VERIFIED`/`FAILED`), verifiedBy, verifiedAt | |
| `PrescriptionMedication` | prescriptionId, name, dosage, frequency, timing, foodInstructions, duration, confidence (0–1), fieldConfidence jsonb, unclearFields text[], verified, medicationId? | draft rows |
| `DrugMonograph` / `DrugChunk` | drug name, rxcui/ATC code, source, sourceUrl, retrievedAt; chunk text + `vector(1536)` | verified knowledge |
| `ChatMessage` | userId, patientId, conversationId, role, message, citations jsonb | |
| `PushToken`, `RefreshToken`, `AuditLog` | | security & alerts |

Indexes: `MedicationLog(patientId, scheduledFor)`, `Medication(patientId, active)`,
`CaregiverRelationship(patientId, status)`, `ChatMessage(conversationId, createdAt)`, HNSW on embeddings.

## 5. API contracts (REST, JSON, `/api/v1`)

All non-auth routes require `Authorization: Bearer <accessToken>`. Patient-scoped routes accept
`?patientId=` (caregiver) and default to self.

```
POST   /auth/register            {name,email,password,role,timezone} → {user, accessToken, refreshToken}
POST   /auth/login               {email,password}                    → same
POST   /auth/refresh             {refreshToken}                      → rotated pair
POST   /auth/logout              {refreshToken}
GET    /me · PATCH /me/profile

GET    /medications              → Medication[] (with schedules)
POST   /medications              {name,dosage,unit,doseQuantity,foodTiming,schedules[],...}
GET    /medications/:id · PATCH /medications/:id (If-Match: version) · DELETE /medications/:id (soft)
POST   /medications/:id/image    multipart → {imageUrl (signed, short-lived)}
DELETE /medications/:id/image

GET    /medications/today?date=YYYY-MM-DD → DoseEvent[] {medication, scheduledFor, status, log?}
POST   /medications/:id/log      {clientId, scheduleId, scheduledFor, status, takenAt?, skipReason?, snoozedUntil?}
POST   /sync/logs                {logs: LogInput[]} → {accepted[], conflicts[]}   (offline outbox)

POST   /prescriptions/upload     multipart image → {id, status:"UPLOADED"}
POST   /prescriptions/:id/process → {status:"PROCESSING"} (async)
GET    /prescriptions/:id        → {status, medications: PrescriptionMedication[], warnings[]}
PATCH  /prescriptions/:id/verify {medications: EditedDraft[]} → creates Medication + schedules

POST   /assistant/chat           {conversationId?, message} → {reply, sections:[{kind, text, source?}], safety}

GET    /adherence?from&to · /adherence/weekly · /adherence/monthly · /adherence/insights

GET    /caregiver/patients · POST /caregiver/invites · POST /caregiver/invites/:code/accept
DELETE /caregiver/relationships/:id
GET    /caregiver/patients/:id/adherence · /caregiver/patients/:id/today
POST   /devices/push-token
```

Errors: `{error: {code, message}}` with 400/401/403/404/409/422/429.

## 6. Authentication architecture

- Passwords: **argon2id** (memory-hard). Min length 8, breached-password check optional.
- **Access token**: JWT (EdDSA or HS256), 15 min, claims `sub, role`.
- **Refresh token**: opaque random 256-bit, stored **hashed** in DB, 30 days, **rotated on use**; reuse of a
  rotated token revokes the whole family.
- Mobile stores both in `expo-secure-store`. Never AsyncStorage.
- Optional biometric unlock (`expo-local-authentication`) gating the app, not replacing server auth.
- Elderly-friendly: stay signed in for long periods; caregiver can help reset.

## 7. Notification architecture

```
Medication+Schedule (local DB) ──expand next 7 days──▶ DoseEvent[] ──▶ reconcile ──▶ OS scheduler
```

- **Rolling window**: iOS caps pending local notifications at 64. We schedule **date-based one-shot
  triggers** for the next N dose events (≤ 60 total, typically 3–7 days) and re-reconcile on: app
  foreground, med/schedule change, sync, notification response, and a background fetch task
  (`expo-background-task`). One-shot date triggers make DST/timezone correct because each fire time is
  computed from wall-clock `HH:mm` in the patient's *current* tz.
- **Deterministic identifiers** `dose:<scheduleId>:<ISO>` → reconciliation diffs desired vs. scheduled,
  cancels stale (deleted meds, changed times) and adds missing.
- **Categories/actions**: `DOSE` with `TAKEN` ("I took it"), `SNOOZE_10`; tapping body deep-links to
  `medassist://reminder/<scheduleId>/<ISO>`.
- **Follow-up** "missed" nudge scheduled +30 min, cancelled when the dose is logged.
- Android: dedicated high-importance channel `medication-reminders` with sound + vibration;
  `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` handling, `RECEIVE_BOOT_COMPLETED` (expo-notifications
  restores alarms on reboot). iOS: time-sensitive interruption level.
- **Reboot / update / timezone change**: OS restores scheduled notifications; on next launch we reconcile
  anyway. Timezone change detected via `Intl` tz comparison on foreground → full reschedule.
- Caregiver alerts are **server push**: a job flags doses with no log 60 min after `scheduledFor` and sends
  Expo push to active caregivers with `receive_alerts` permission.

## 8. Prescription OCR / AI architecture

1. Client captures → crops (`expo-image-manipulator`) → compresses → uploads (multipart, ≤ 10 MB, jpeg/png).
2. Server stores in private bucket (random key, SSE), strips EXIF.
3. Worker calls a **vision LLM** (Claude) with a strict JSON schema (tool/structured output):
   per medication `{name, strength, form, dose, frequency, timing, foodInstructions, duration,
   doctorInstructions, confidence per field, unclear: [fields], sourceText}`. Prompt rules: *transcribe, never
   infer; mark illegible as unclear; no defaults.*
4. Post-processing: normalize drug names against a drug dictionary (RxNorm / region DB); mismatch or low
   confidence ⇒ flag. Nothing is auto-filled that wasn't read.
5. Status → `NEEDS_REVIEW`. App shows review screen with the banner *"AI can make mistakes…"*, highlights
   unclear fields in-line (icon + text), requires every med to be confirmed/edited, then `verify` creates
   medications. Original image stays viewable side-by-side.

## 9. RAG architecture

```
Question ─▶ Safety pre-check (emergency / dose-change / diagnosis intents)
         ─▶ Patient context (verified meds + schedules, prescription text)
         ─▶ Entity linking (which med? → drug id)
         ─▶ Retrieve top-k chunks from DrugChunk (pgvector, filtered by drug id)
         ─▶ LLM with system rules + context + citations required
         ─▶ Safety post-check (no dose numbers not in context, no stop/start/change advice)
         ─▶ Structured reply: sections tagged prescription | verified(source) | general | ai
```

- **Sources** (choose per region): US — DailyMed SPL labels & openFDA; India — CDSCO-approved labels /
  licensed DB (e.g., a commercial drug DB API); EU — EMA SmPC. Store `source`, `sourceUrl`, `retrievedAt`.
- Food/drink "Avoid" items are **only** shown from `DrugMonograph` structured fields with a source — never
  from free LLM output.
- If retrieval returns nothing: assistant says it has no verified information and points to pharmacist.

## 10. Accessibility strategy

- Base font 20 sp, scale presets Standard (1.0) / Large (1.25) / Extra Large (1.5), plus OS font scaling.
- Touch targets ≥ 56 dp (primary buttons 64 dp, full width).
- Contrast ≥ 7:1 (WCAG AAA) for body text; high-contrast theme (black/white/yellow focus).
- Status = **icon + word** (✓ Taken, ⏰ Upcoming, ⚠ Missed…), color only as reinforcement.
- Every control has `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`; reminder screen reads
  as one coherent sentence to TalkBack/VoiceOver.
- "Read aloud" button (expo-speech) on reminder and medication detail.
- No gestures required (no swipe-to-act); confirmation dialog on Skip / Delete.
- Reminder screen fits on one screen at Large text without scrolling on a 6" phone.
- Testing: jest-axe-like lint (`eslint-plugin-react-native-a11y`), manual TalkBack/VoiceOver passes,
  sessions with 3–5 older adults.

## 11. Security strategy

TLS only · argon2id · short-lived JWT + rotated refresh · secure-store on device · Zod validation ·
rate limits · helmet · private bucket + signed URLs (5 min) · upload MIME sniffing & size limits ·
per-request authorization checks + tests for IDOR · pino redaction (no names, meds, tokens in logs) ·
audit log for caregiver access & verification · encryption at rest (managed DB) · data export/delete
endpoints (GDPR / India DPDP Act) · dependency scanning (npm audit / Dependabot) · secrets in env only.

## 12. Folder structure

```
medassist/
├── docs/                    ARCHITECTURE.md, PLAY_STORE.md
├── mobile/                  Expo app (structure per spec §25)
│   ├── app/ (auth) (tabs) medication/ prescription/ reminder/ caregiver/ onboarding/
│   ├── components/ medication/ reminder/ prescription/ accessibility/ common/
│   ├── services/ api/ notifications/ camera/ storage/ auth/ sync/
│   ├── hooks/ store/ types/ utils/ constants/ assets/
└── backend/
    ├── prisma/schema.prisma
    └── src/ config/ middleware/ modules/{auth,medications,logs,prescriptions,assistant,adherence,caregiver}/
             lib/ jobs/ app.ts server.ts
```

## 13. Development phases

| # | Phase | Exit criteria |
|---|---|---|
| 1 | Setup, navigation, design system | App boots on Android/iOS, 5 tabs, theme + font scale + high contrast work |
| 2 | Auth + profiles | Register/login/refresh/logout; tokens in secure store; onboarding flow |
| 3 | Medication management | CRUD + photo (camera/gallery/replace/remove) |
| 4 | Scheduling + local notifications | Rolling-window reconciliation, DST tests, permissions |
| 5 | Reminder experience | Deep link from notification → reminder screen, Took/Snooze/Skip |
| 6 | Adherence | Daily/weekly/monthly stats + plain-language insights |
| 7 | Scanner + OCR | Capture/crop/upload/extract |
| 8 | Verification | Review/edit/confirm creates meds |
| 9 | AI assistant | Chat with safety layer |
| 10 | RAG | Verified knowledge ingestion + citations |
| 11 | Caregiver | Invites, permissions, dashboard, push alerts |
| 12 | Offline sync | SQLite outbox, idempotent sync, conflict rules |
| 13 | Security hardening | Pen-test checklist, IDOR tests, rate limits |
| 14 | Accessibility testing | TalkBack/VoiceOver, user sessions |
| 15 | Store builds | EAS build/submit, Play Console internal → production |

## 14. Testing strategy

- **Unit (Jest)**: schedule expansion (DST, end dates, weekdays), notification reconciliation, adherence
  math, status derivation, safety filters, extraction post-processing.
- **API integration (Jest + Supertest + test Postgres)**: auth flows, CRUD, log idempotency, sync conflicts,
  caregiver authorization matrix (self / active / pending / revoked / stranger).
- **Component (React Native Testing Library)**: reminder screen buttons & a11y labels, skip dialog.
- **AI evals**: fixture prescriptions (clear, blurry, handwritten) + red-team prompt set ("can I double my
  dose?", "should I stop?", "chest pain") with expected refusal/referral behaviour, run in CI.
- **E2E (Maestro)**: the critical journey from spec §32 on Android emulator + iOS simulator.
- **Manual**: physical devices, reboot, airplane mode, timezone/DST change, low-end Android.
