# MedAssist

A medication-adherence app for older adults: Expo / React Native on the phone, Node + Postgres on the server.

| Folder | What |
|---|---|
| `mobile/` | Expo app (Expo Router, shadcn via React Native Reusables + NativeWind) |
| `backend/` | Express 5 + Prisma 7 + PostgreSQL API |
| `docs/ARCHITECTURE.md` | Architecture, schema, API and phase plan |
| `docs/PLAY_STORE.md` | How to publish to Google Play |

## Quick start (no database needed)

```bash
cd backend && npm install && npm run dev:memory   # API on :4000, data kept in memory only
cd mobile  && npm install && npx expo start       # scan the QR code with Expo Go
```

On a physical phone, set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your computer's Wi-Fi IP, e.g.
`http://192.168.1.20:4000` (find it with `ipconfig`).

## Real database (your local Postgres 18)

```bash
cd backend
copy .env.example .env        # then put your postgres password in DATABASE_URL and set JWT_ACCESS_SECRET
"C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres medassist
npm run db:deploy             # applies prisma/migrations
npm run dev
```

## Checks

```bash
cd backend && npm test && npm run typecheck   # 29 API tests on an embedded Postgres
cd mobile  && npm test && npx tsc --noEmit    # 23 unit tests
```

## Status
- **Phase 1:** navigation, design system, Home / Schedule / Reminder screens. Uses demo medicines for now.
- **Phase 2:** secure accounts (argon2id, 15-minute JWT, rotating refresh tokens with reuse detection,
  rate limiting), onboarding, sign-in / sign-up, profile, sign out and account deletion.
  Tokens are stored in the device keychain.
- **Phase 3:** medication management. Add, edit and delete medicines with photos (re-encoded, private,
  and served through signed links that expire after an hour). Schedules use chosen times with every day /
  certain days / every N days, plus a course length. Removed times are archived, not deleted, so dose
  history is kept. Edits are version-checked. The medicine list is cached for offline use and wiped on sign-out.
- **UI:** Plus Jakarta Sans font, gradient home hero with an adherence ring, a colour per medicine,
  and time-of-day colours and icons.
- **Phase 4:** reminders. These are local notifications scheduled on the phone, so they work offline
  and with the app closed. The app keeps a rolling window of reminders for the next few days (up to 60,
  within iOS's 64 limit) and re-checks it whenever the app opens, anything changes, or the background
  task runs. Reminders survive a reboot. Each one has "✓ I took it" and "Snooze 10 min" buttons, plus a
  gentle nudge 30 minutes later if the dose isn't recorded. Tapping one opens that dose. Profile has a
  test button. All reminders are removed on sign-out.
- **UI:** cream, ink and blush design with mustard highlight cards and a floating dark tab bar with a "+" button.
- **Phase 5/6:** dose history on the server and adherence tracking.
  - Every Took it / Skip / Snooze / Undo is saved on the phone first, then sent to
    `POST /dose-logs/sync`. It works offline and retries when the connection returns.
  - Retries never double-count a dose, and when two devices disagree the newest action wins.
  - The server works out adherence in the patient's own timezone (DST-safe). Missed doses are
    worked out automatically. Late doses (more than 1 hour after their time) are flagged.
  - Doses from before a medicine was added never count as missed.
  - `GET /adherence/weekly|monthly` returns daily figures, per-medicine figures, and plain-language
    insights that never give dosing advice.
  - The **History** screen (Home → History) has a week or 30-day chart, counts, insights and per-medicine bars.
- **Hosting:** photos can be stored in Postgres (`STORAGE_DRIVER=db`) for Render free. See `render.yaml` and `docs/DEPLOY.md`.
- **Next, Phase 7/8:** prescription scanner (camera, then AI extraction, then patient verification).

## Testing reminders
Expo Go on **Android** can't use notifications (Expo removed them in SDK 53). The app still runs there,
but reminders show as unavailable. To test reminders, install a **development build** once:
```bash
npm i -g eas-cli
eas login
cd mobile
eas build --profile development --platform android
```
When it finishes, open the link or scan the QR code on your phone to install the APK. Then run
`npx expo start` and open the project in the *MedAssist* app (not Expo Go). JavaScript changes still
reload instantly; you only rebuild when you add a native library.

1. Open the development build and allow notifications.
2. Profile → **Send a test reminder**, then lock the phone. It arrives in about 10 seconds.
3. Add a medicine with a time a few minutes ahead. Close the app and wait. When it arrives, try both
   **✓ I took it** and **Snooze 10 min**.
4. Android: if reminders arrive late, go to Settings → Apps → Expo Go (or MedAssist) → *Alarms & reminders* → Allow,
   and set Battery to *Unrestricted*.
5. To check reliability properly (reboot, exact alarms, the background refresh), use a development build:
   `npx eas-cli build --profile development -p android`.
