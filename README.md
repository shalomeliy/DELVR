# 📦 DELVR

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Google_Maps-4285F4?style=for-the-badge&logo=google-maps&logoColor=white" alt="Google Maps API" />
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
</p>

אפליקציית ווב מתקדמת המותאמת לשליחים: מאפשרת להקריא או להקליד כתובות בעברית, מאמתת אותן מול Google, מחשבת את סדר הנסיעה האופטימלי והמהיר ביותר לפי זמני אמת של Google (כולל עומסי תנועה), ומספקת ניווט ישיר ומהיר ב-Waze.

📖 **תיעוד נוסף:**
* [מדריך התקנה מלא (כולל הגדרת מפתח Google ותקרות שימוש)](docs/SETUP.md)
* [סקירת האפליקציה וצילומי מסך](docs/ABOUT.md)

---

## 🚀 הרצה מקומית (Windows)

תהליך מהיר המותאם לעבודה שוטפת:

1. **פעם ראשונה בלבד:** לחיצה כפולה על הקובץ `set-google-key.bat`, הדבקת מפתח ה-Google API ולחיצת Enter (המפתח נשמר מקומית בקובץ `.env.local`).
2. **הפעלת המערכת:** לחיצה כפולה על `start-delvr.bat`. בפעם הראשונה יותקנו החבילות הנדרשות אוטומטית, ולאחר מכן ייפתח דפדפן Chrome בכתובת:  
   👉 `http://localhost:5173`

> 🔑 **דרישות ב-Google Cloud:** יש לוודא שמופעלים ה-APIs הבאים:  
> `Maps JavaScript API` | `Geocoding API` | `Routes API`

---

## 🛠️ פקודות מערכת (CLI)

| פקודה | מה היא עושה |
| :--- | :--- |
| `npm run dev` | הרצת האפליקציה מקומית (כולל פונקציית סידור המסלול `/api/optimize`) |
| `npm test` | הרצת בדיקות (פרסר, כלל התיקון, לוגיקת מסלול ופונקציות השרת) |
| `npm run build` | בדיקת טיפוסים ובניית קבצים לסביבת ייצור (Production) |

---

## 📂 מבנה הפרויקט

```text
├── src/
│   ├── domain/       # פרסר הקראה (מהספייק), מודל הנתונים ולוגיקת המסלול
│   ├── services/     # אינטגרציה עם Google Maps, גיאוקודינג, הקראה, שרת ו-Waze
│   ├── store/        # שמירת נתונים במכשיר (IndexedDB): מסלול נוכחי וכתובות שתוקנו
│   └── ui/           # מסכי הממשק של האפליקציה
└── api/
    └── optimize.ts   # פונקציית שרת (Vercel) הקוראת ל-Routes API (לוגיקה ב-_lib/optimize.ts)
