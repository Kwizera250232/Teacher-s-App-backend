# UClass Parent (Expo)

Mobile app for **parents** to receive push notifications when teachers assign homework, share class moments, or the school posts announcements — even when the app is closed.

## EAS project

- Project ID: `4bb1dc32-c0ec-4bcd-945b-0c51e40d058b` (in `app.config.js`)
- Initialize locally (optional if config is already set):

```bash
npm install -g eas-cli
cd studentumunsiapp
npx eas-cli init --id 4bb1dc32-c0ec-4bcd-945b-0c51e40d058b
```

## API

Default API: `https://studentapi.umunsi.com/api`

Override for local dev:

```bash
export EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:5000/api
npx expo start
```

Backend endpoints used:

- `POST /api/auth/login` — parent accounts only
- `POST /api/mobile/push/register` — save Expo push token
- `GET /api/parent/hub` — children + notifications
- `PUT /api/parent/notifications/:id/read`

Server optional env: `EXPO_ACCESS_TOKEN` (Expo push API bearer token for higher rate limits).

## Run on device

Push notifications require a **physical phone** and a **development or production build** (not Expo Go for production push in many cases).

```bash
cd studentumunsiapp
npm install
npx expo start
```

For installable builds:

```bash
npx eas build --profile preview --platform android
npx eas build --profile production --platform all
```

Android FCM: add `google-services.json` and set `GOOGLE_SERVICES_JSON` in EAS secrets, or place the file and reference it in `app.config.js`.

## What triggers push?

The API sends Expo push when `insertParentNotification` runs, including:

- New homework (`routes/homework.js`)
- Class moments, school announcements, parent reminders (existing hub flows)

Parents must sign in once so the device token is registered.
