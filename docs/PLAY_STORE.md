# Publishing MedAssist to Google Play

## 0. One-time accounts
1. **Google Play Console developer account**: https://play.google.com/console. One-time US$25 fee plus
   identity verification. Pick **Personal** or **Organization**. Organization accounts need a D-U-N-S number.
   Health apps are easier to get approved as an organization.
2. **Expo account**: https://expo.dev (free). Then run `npm i -g eas-cli` and `eas login`.

> **New personal accounts** (created after Nov 2023) must run a **closed test with at least 12 testers
> for 14 days in a row** before they can apply for production access. Plan for this: family and friends work.

## 1. Prepare the app
- `mobile/app.json`: set a unique `android.package` (e.g. `com.yourname.medassist`). **This can never change
  after the first upload.** Also set `version` and `android.versionCode`, which must go up with every upload.
- Icon: 1024×1024 PNG. Adaptive icon: a foreground layer plus a background color. Splash screen.
- Point `EXPO_PUBLIC_API_URL` at your **production HTTPS backend**. Play reviewers must be able to log in.

## 2. Build a signed Android App Bundle (AAB)
```bash
cd mobile
eas build:configure          # creates eas.json
eas build -p android --profile production
```
EAS creates and stores your **upload keystore**. Keep a backup with `eas credentials`. Play App Signing
holds the real app-signing key.

## 3. Create the app in Play Console
Go to **Create app**, then enter the name, default language, App, Free, and accept the declarations. Then
complete **Dashboard → Set up your app**:

| Section | What to enter for MedAssist |
|---|---|
| Privacy policy | Public URL (required). Cover health data, prescription images, AI processing, caregiver sharing, retention, and deletion |
| App access | Give a **demo login** (a test patient account with sample medications) |
| Ads | No |
| Content rating | Fill in the IARC questionnaire (category: Health/Medical, Utility) |
| Target audience | 18+ |
| **Data safety** | Declare: email and name (account), **Health info** (medications, adherence), photos (prescriptions), app interactions. Encrypted in transit: yes. Users can request deletion: yes (you must provide an in-app delete and a web deletion URL) |
| **Health apps declaration** | Choose "Medication and treatment management". Add a disclaimer that it is not a medical device and does not diagnose |
| Government apps / financial features | No |
| Permissions | **Exact alarms**: if you use `USE_EXACT_ALARM`, declare that the core function is medication reminders. Camera and photos are justified by the prescription scanner |
| Store listing | Short description (80 chars), full description, 2–8 phone screenshots, 512×512 icon, 1024×500 feature graphic |

## 4. Testing tracks → production
1. **Internal testing**: upload the AAB (`eas submit -p android` or drag and drop it). Up to 100 testers, available instantly.
2. **Closed testing**: 12+ testers for 14 days if you have a new personal account. Collect feedback.
3. **Apply for production** (Dashboard). Then **Production → Create release**, add release notes, and do a
   staged rollout of 10% → 50% → 100%.
4. The first review usually takes a few days. Health apps may get extra scrutiny.

Automate submission:
```bash
eas submit -p android --profile production
```
(This needs a Google Cloud service-account JSON with Play Console API access. It is set up once in
Play Console → Users & permissions.)

## 5. Health-app compliance checklist
- In-app and store-listing disclaimer: *"MedAssist helps you follow your prescribed plan. It is not a
  substitute for professional medical advice."*
- Don't claim to diagnose, treat, or replace a doctor. Don't call the AI "medically accurate".
- Account deletion in the app **and** via a web URL (a Play requirement).
- Follow the privacy laws where you ship (India: DPDP Act 2023; EU: GDPR; US: HIPAA only applies if you work
  with covered entities).
- Emergency button: opens the phone dialer. The app never claims to be an emergency service.

## 6. Updates
Bump `version` / `versionCode` → `eas build` → `eas submit`. For JS-only fixes you can use
`eas update` (OTA) within the store policy: bug fixes only, with no change to the app's core purpose.
