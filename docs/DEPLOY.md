# Free hosting: Neon (database) + Render (API)

Everything is on free plans.

| Piece | Service | Free plan notes |
|---|---|---|
| PostgreSQL | **Neon** | 0.5 GB storage, sleeps when idle and wakes in about 1 s |
| API (Node) | **Render** web service | Sleeps after 15 min idle, first request then takes about 50 s. Disk is wiped on restart, so photos are stored in Postgres (`STORAGE_DRIVER=db`) |

> Free Render is fine for testing with family. Before a real launch, move to a paid plan
> (about $7/month) so the API never sleeps and reminders sync straight away.

## 1. Put the whole project on GitHub
Render deploys from a Git repository that contains `backend/`.
```bash
cd C:\padhaiii\PROJECTS\medassist
git init
git add .
git commit -m "MedAssist: phases 1-4"
```
Create an **empty private** repo on github.com (for example `medassist`), then:
```bash
git remote add origin https://github.com/<you>/medassist.git
git branch -M main
git push -u origin main
```
Check that `.env` files are **not** in the commit (they are gitignored).

## 2. Neon database
1. Sign up at https://neon.tech and create a project named `medassist`, region **AWS Asia Pacific (Singapore)**.
2. Dashboard → **Connect**. Turn **Connection pooling off** to get the *direct* connection string. It looks like
   `postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
3. Keep it somewhere safe; you'll paste it into Render. Never commit it.

## 3. Render API
1. Sign up at https://render.com and connect your GitHub account.
2. **New → Blueprint**, then pick the `medassist` repo. Render reads `render.yaml` and creates `medassist-api`.
3. When asked for `DATABASE_URL`, paste the Neon connection string. `JWT_ACCESS_SECRET` is generated automatically.
4. Deploy. The first build takes about 3–5 min. On start it runs `prisma migrate deploy`, which creates the tables in Neon.
5. Open `https://medassist-api.onrender.com/health`. It should show `{"ok":true}`.
   If Render gives the service a different URL, put that URL in `mobile/eas.json` (`preview` and `production` → `EXPO_PUBLIC_API_URL`).

## 4. Point the app at the hosted API
- **Development build:** set `EXPO_PUBLIC_API_URL=https://medassist-api.onrender.com` in `mobile/.env`, then restart `npx expo start`.
- **Shareable APK** (works without your PC):
  ```bash
  cd mobile
  eas build --profile preview --platform android
  ```
  Share the download link it prints. Anyone can install it; they may need to allow "Install unknown apps".

## Updating
Push to `main`, and Render redeploys automatically and applies any new migrations.
For app changes that are JavaScript only, `eas update` can deliver them without a rebuild (optional, set up later).
