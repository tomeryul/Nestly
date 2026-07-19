# 🏠 Nestly — ניהול משק הבית

אפליקציה לניהול משק הבית המשותף: **קניות**, **בישולים**, ו**לוז שבועי** — עם ריבוי משתמשים,
חלוקת אחריות, והתראות דחיפה (Web Push).

בנויה כ‑SPA סטטי (React + Vite + TypeScript + Tailwind) שרץ על **GitHub Pages**, עם
**Supabase** כ‑backend (Postgres + Auth + Realtime + Edge Functions + pg_cron).

---

## התכונות

### 🛒 קניות
- ניהול **מספר רשימות** קניות במקביל.
- לכל מצרך: כמות, קטגוריה, וסימון "נקנה".
- **פריטים אוטומטיים** — מצרכים שנכנסים לרשימה אוטומטית ביום קבוע בכל שבוע (pg_cron).
- עדכון בזמן אמת בין כל בני הבית (Supabase Realtime).

### 👨‍🍳 בישולים
- ניהול **מאכלים קבועים**, ולכל מאכל רשימת **מצרכים**.
- שיבוץ מאכלים ל**תפריט השבועי**.
- כפתור אחד מוסיף את כל מצרכי המאכל **אוטומטית לרשימת הקניות** (איחוד כמויות של מצרך זהה).

### 🗓️ לוז שבועי
- לוח שבועי עם משימות לפי יום ושעה, קטגוריות צבעוניות, ואחראי לכל משימה.
- **משימות קבועות** שנכנסות ללוז אוטומטית בכל שבוע.

### 👥 בתים ומשתמשים
- התחברות משתמשים (מייל+סיסמה / קישור קסם).
- המשתמש הראשון יוצר **בית**, ומזמין שותפים בעזרת **קישור הזמנה**.
- לכל שותף אפשר להגדיר **תחומי אחריות** (קניות / בישולים / לוז).

### 🔔 התראות
- **Web Push** דרך Service Worker + VAPID + Supabase Edge Function.
- כשמשבצים בישול לשבוע — **האחראי על הקניות מקבל התראה** לקבוע יום ושעה לקנייה.
- תזכורות למשימות שמתחילות בקרוב (pg_cron כל 5 דק׳).

---

## ארכיטקטורה

```
React SPA (GitHub Pages)  ──HTTPS──►  Supabase
  ├─ Auth (email / magic link)          ├─ Postgres + Row Level Security
  ├─ Realtime subscriptions             ├─ RPC functions (create_home, accept_invite, add_meal_to_list)
  ├─ Service Worker (push)              ├─ pg_cron  → generate_recurring / task reminders / push dispatch
  └─ VAPID public key                   └─ Edge Function `push-dispatch` (Web Push via VAPID)
```

כל הטבלאות מוגנות ב‑**Row Level Security** ומשויכות ל‑`home_id`; משתמש רואה רק נתונים של
בתים שהוא חבר בהם (`is_home_member`).

---

## הרצה מקומית

```bash
npm install
npm run dev        # http://localhost:5173/nestly/
```

הקונפיגורציה הציבורית (URL של Supabase, anon key, VAPID public) מוטמעת ב‑`src/lib/config.ts`
עם ברירות מחדל, וניתנת לדריסה דרך משתני `VITE_` (ראו `.env.example`).

---

## פריסה ל‑GitHub Pages

1. דחפו ל‑`main`.
2. ב‑**Settings → Pages** של הריפו, בחרו **Source: GitHub Actions**.
3. ה‑workflow שב‑`.github/workflows/deploy.yml` בונה ופורס אוטומטית.

> ה‑`base` ב‑`vite.config.ts` הוא `/nestly/` — אם שם הריפו שונה, עדכנו בהתאם.

### הגדרת Supabase Auth
ב‑Supabase Dashboard → **Authentication → URL Configuration** הוסיפו ל‑Redirect URLs את כתובת
ה‑Pages (למשל `https://<user>.github.io/nestly/`). לבדיקות מהירות אפשר לכבות אימות מייל תחת
**Authentication → Providers → Email → Confirm email**.

---

## מסד הנתונים

מיגרציות SQL תחת `supabase/migrations/` (מיושמות כבר על הפרויקט):

| קובץ | תוכן |
|------|------|
| `0001_core` | פרופילים, בתים, חברים, הזמנות, RLS, RPCs |
| `0002_shopping` | רשימות, מצרכים, פריטים אוטומטיים |
| `0003_cooking` | מאכלים, מצרכים, תפריט שבועי, `add_meal_to_list` |
| `0004_schedule` | משימות לוז + משימות קבועות |
| `0005_notifications` | התראות, מנויי push, טריגר בישול→קניות |
| `0006_cron` | קונפיג פרטי, `generate_recurring`, תזכורות, jobs של pg_cron |
| `0007_push_config_rpc` | RPC לקריאת קונפיג ע"י ה‑Edge Function |
| `0008_harden_function_grants` | הרשאות EXECUTE מצומצמות לפונקציות |

Edge Function: `supabase/functions/push-dispatch/` — שולח Web Push למנויים על סמך התראות שממתינות.
