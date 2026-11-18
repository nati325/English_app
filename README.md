# Native Path · חברים לאנגלית 🐾

אפליקציית PWA (מובייל תחילה) ללימוד אנגלית עד רמת שפת אם (General American). ראו `PLAN.md` לתוכנית המלאה.

## הרצה מקומית
```
python3 -m http.server 8000      # ואז http://localhost:8000
```
המיקרופון בטלפון דורש HTTPS – לכן מפרסמים ב-GitHub Pages.

## מבנה
- `js/stage.js` – במה תלת־ממדית (Three.js, GLB עם שלד ואנימציות)
- `js/srs.js` · `js/store.js` – חזרות מרווחות, התקדמות, XP ורצף (localStorage)
- `js/speech.js` · `js/rec.js` – קול, זיהוי דיבור, הקלטה וניתוח קצב
- `js/views.js` · `js/rhythm.js` – המסכים
- `data/core.txt` → `node tools/build-words.mjs` → `data/words.json` (IPA מ-CMUdict)

## קרדיטים
מודלי חיות: Quaternius (CC0) · הגייה: CMUdict (BSD) · Three.js (MIT)
