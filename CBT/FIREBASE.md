# Firebase console checklist (CBT Portal)

The live URL is still **`CBT/cbt.html`** (same path your portfolio card uses: `./CBT/cbt.html`). The Vue app boots from that file and loads `./src/…`. Opening the folder (`/CBT/`) redirects to `cbt.html`. The old single-file demo is `cbt-legacy.html`. Hash routes work without extra Apache rewrites.

## 1. Create a project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Add a project (Spark / free is enough).
3. Add a **Web** app and copy the config object into `src/config.js`.

## 2. Authentication

1. Build → Authentication → Get started.
2. Enable **Google**.
3. Authentication → Settings → Authorized domains: keep `localhost`. Add your real domain later.

## 3. Firestore

1. Build → Firestore Database → Create database (start in **production** mode).
2. Rules tab: paste `firestore.rules`.
3. If history cards fail to load, Firestore may prompt you to create a composite index on `attempts`: `userId` + `examMode` + `createdAt` (descending). Click the error link or use the fallback query already in the app.

## 4. What gets stored

| Collection | Purpose |
|---|---|
| `users` | Name, email, photo, exam track (IOE / CEE / Other) |
| `quota` | Daily conversion count per user |
| `attempts` | Small summary for dashboard cards (score, pass/fail, time) |
| `attemptDetails` | **Full paper**: questions, options, your answers, guesses, explanations — used when you tap **View full report** days later |
| `pyqSets` | Published past papers (read-only for students) |

Gemini API keys stay in **browser localStorage** only (`Settings`).

## 5. Admin PYQ import

Put your Auth UID in:

- `src/config.js` → `adminUids`
- `firestore.rules` → `isAdmin()` array

Then Settings shows **Import PYQ JSON**.
