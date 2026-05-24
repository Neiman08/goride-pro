# RideApp — Deploy Guide

## Prerequisites
- GitHub account
- [Render.com](https://render.com) account (free tier works for testing)
- MongoDB Atlas cluster (free tier: M0)
- Google Maps API key with these APIs enabled:
  - Maps JavaScript API
  - Places API
  - Distance Matrix API
  - Directions API
  - Geocoding API

---

## Step 1 — MongoDB Atlas

1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) → Create free cluster
2. Database Access → Add user → username + strong password
3. Network Access → Add IP → `0.0.0.0/0` (allow all — Render uses dynamic IPs)
4. Clusters → Connect → Drivers → Copy URI:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/rideapp?retryWrites=true&w=majority
   ```

---

## Step 2 — Google Maps

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. New project → Enable APIs:
   - Maps JavaScript API
   - Places API
   - Distance Matrix API
   - Directions API
   - Geocoding API
3. Credentials → Create API Key
4. Restrict key to your Render domain (after deploy)

---

## Step 3 — Push to GitHub

```bash
cd rideapp
git init
git add .
git commit -m "Initial commit — RideApp v2"
git remote add origin https://github.com/YOUR_USERNAME/rideapp.git
git push -u origin main
```

---

## Step 4 — Deploy to Render

### Option A — Blueprint (recommended, one click)
1. Render Dashboard → New → Blueprint
2. Connect your GitHub repo
3. Render reads `render.yaml` automatically
4. Set secret env vars manually (see Step 5)

### Option B — Manual
**Backend:**
1. New → Web Service → Connect repo
2. Root directory: `backend`
3. Build: `npm install`
4. Start: `node src/index.js`
5. Health check: `/api/health`

**Frontend:**
1. New → Static Site → Connect repo
2. Root directory: `frontend`
3. Build: `npm install && npm run build`
4. Publish: `build`
5. Rewrite rule: `/* → /index.html`

---

## Step 5 — Environment Variables

Set these in Render Dashboard → Environment → Add Secret File:

### Backend secrets (never in render.yaml)
```
MONGODB_URI=mongodb+srv://...
GOOGLE_MAPS_API_KEY=AIza...
ADMIN_EMAIL=admin@yourapp.com
ADMIN_PASSWORD=YourStrongPassword123!
```

### Frontend secrets
```
REACT_APP_GOOGLE_MAPS_KEY=AIza...
```

> Render auto-generates JWT_SECRET and JWT_REFRESH_SECRET via `generateValue: true`

---

## Step 6 — Update CORS

After backend deploys, copy the backend URL (e.g. `https://rideapp-backend.onrender.com`).

In Render backend service → Environment → Add:
```
FRONTEND_URL=https://rideapp-frontend.onrender.com
```

In Render frontend service → Environment → Add:
```
REACT_APP_API_URL=https://rideapp-backend.onrender.com/api
REACT_APP_SOCKET_URL=https://rideapp-backend.onrender.com
```

Then **Manual Deploy** → Deploy latest.

---

## Step 7 — PWA Icons (optional but recommended)

```bash
cd frontend
npm install sharp --save-dev
# Place your 512x512 logo at: public/icons/source.svg
node scripts/generate-icons.js
git add public/icons public/splash
git commit -m "Add PWA icons"
git push
```

---

## Step 8 — Install on iPhone

1. Open `https://rideapp-frontend.onrender.com` in Safari
2. Share button → "Add to Home Screen"
3. App installs with splash screen and runs standalone

---

## Step 9 — Verify

```bash
# Health check
curl https://rideapp-backend.onrender.com/api/health

# Expected:
# {"status":"ok","env":"production","timestamp":"..."}
```

---

## Production checklist

- [ ] MongoDB Atlas M10+ (paid) for production workloads
- [ ] Render Starter plan minimum ($7/mo per service)
- [ ] Google Maps API key restricted to your domains
- [ ] Strong ADMIN_PASSWORD (16+ chars)
- [ ] Enable MongoDB Atlas backups
- [ ] Set up Render alerts (CPU/memory thresholds)
- [ ] Add custom domain + SSL (Render handles SSL automatically)
- [ ] Test PWA install on iOS and Android

---

## Upgrading to Android APK (Capacitor)

```bash
cd frontend
npm run build
npx cap init RideApp com.yourcompany.rideapp
npx cap add android
npx cap copy android
npx cap open android   # Opens Android Studio
# Build → Generate Signed APK
```
