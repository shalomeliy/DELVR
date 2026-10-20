# מפת דרכים לטמפלט: נושאי אתר

הקובץ הזה שייך לטמפלט בלבד. `new-project-setup` מוחק אותו בכל עותק חדש. כל מה שנבנה לפיו נכנס לטמפלט כסקיל כללי, שמופעל רק כשהפרויקט הוא אתר.

נבדק: 2026-10-07, תיקייה `New Claude project`.

## מה יש בתיקייה בפועל

- 6 סוכנים ב-`.claude/agents/`: architecture, change-reviewer, design, product, qa, security.
- 7 סקילים ב-`.claude/skills/`: architecture-plan, ce-debug, drop-generic-design, loop-engineering, rtl_chat, ui-ux-review, write-feature-spec.
- אין קוד אתר, אין `package.json`, אין `CLAUDE.md`.
- `write-feature-spec` מפנה ל-`CLAUDE.md` ול-`workshop-output/PRODUCT-DIRECTION.md`, ו-`drop-generic-design` מפנה ל-`/design-demo`. שלושתם לא קיימים בתיקייה.

כלומר זה צנרת עבודה כללית (ספק, תכנון, בנייה, בדיקה), בלי שום ידע ייעודי לאתרים. "כיסוי" כאן אומר: האם הצנרת יודעת לדרוש ולבדוק את הנושא.

## טבלת כיסוי

| נושא | מצב | ראיה |
|---|---|---|
| בדיקת מהירות אתר | חלקי חלש | `ce-debug/references/investigation-techniques.md` סעיף Performance Regressions: דיבוג תגובתי של רגרסיה, לא מדידת Core Web Vitals או Lighthouse |
| דחיסת תמונות | חסר | אין אזכור ל-WebP/AVIF, srcset או lazy loading |
| חיבור ל-Google Search Console | חסר | אין אזכור ל-SEO, sitemap, robots |
| מבחני A/B | חסר | המילה experiment מופיעה רק ב-ce-debug בהקשר דיבוג |
| איסוף ביקורות והמלצות | חלקי (מגבלה בלבד) | `drop-generic-design/SKILL.md:16` אוסר המלצות מומצאות. אין מנגנון איסוף |
| חיבור GA4 | חסר | אין אזכור ל-analytics, gtag, GTM |
| מצב בהיר/כהה | חסר | `ui-ux-review` דורש ניגודיות WCAG AA ושימוש ב-tokens, אבל לא theming |
| אנימציות ומיקרו-אינטראקציות | חלקי | `ui-ux-review/SKILL.md:20`: תנועה משרתת היררכיה ומכבדת reduced motion. אין הנחיות ביצוע (משכים, easing, דפוסים) |
| אופטימייזרים למהירות | חסר | אין budget ביצועים, caching, minify, CDN |
| כלי מפות חום | חסר | אין אזכור ל-Clarity/Hotjar |
| תגיות meta | חסר | אין אזכור ל-title, description, Open Graph, canonical |

סיכום: 0 מכוסים, 3 חלקיים, 8 חסרים.

## תוכנית גרסאות

הסדר נקבע לפי תלות: אי אפשר להריץ A/B בלי analytics, ואין טעם במפות חום על אתר שנטען לאט. אנימציות בסוף, כי `ui-ux-review` עצמו אומר לא ללטש לפני שהבסיס תקין.

### v0: לסגור חורים בצנרת הקיימת (קטן, קודם לכל)

- בוצע: `CLAUDE.md` עם ניתוב, סעיף "זה טמפלט", וסקיל `new-project-setup` שממלא סטאק, verify ותקציב ביצועים בכל פרויקט חדש.
- ליצור או להסיר את ההפניות ל-`PRODUCT-DIRECTION.md` ו-`/design-demo`.

### v1: בסיס טכני לכל אתר (מהירות, תמונות, meta, מצב כהה)

סקיל חדש `web-performance`:
- מדידה עם Lighthouse CI על כל PR, יעדי Core Web Vitals: LCP עד 2.5 שניות, INP עד 200ms, CLS עד 0.1 (הספים הרשמיים של Google ל-"Good").
- תמונות: WebP/AVIF, `srcset`/`sizes`, `loading="lazy"` מתחת לקפל, width/height מפורשים נגד CLS, תמונת LCP עם `fetchpriority="high"`.
- אופטימייזרים: minify, compression (Brotli), cache headers, CDN, טעינת פונטים עם `font-display: swap`, דחיית סקריפטים של צד שלישי.

סקיל חדש `seo-meta`:
- רשימת חובה לכל עמוד: title, meta description, canonical, Open Graph, Twitter card, `lang`/`dir="rtl"` לעברית, hreflang אם יש כמה שפות.
- `sitemap.xml`, `robots.txt`, structured data (JSON-LD) בסיסי.

הרחבת `ui-ux-review` או סקיל `theming`:
- tokens לשני מצבים, `prefers-color-scheme` כברירת מחדל, מתג ידני ששומר בחירה, מניעת הבהוב לבן בטעינה, בדיקת ניגודיות AA בשני המצבים.

עדכון `qa-expert` ו-`change-reviewer`: לבדוק את שלושת אלה כחלק מ-definition of done.

### v2: מדידה (GA4, Search Console, מפות חום)

סקיל חדש `analytics-setup`:
- GA4 דרך Google Tag Manager, הגדרת אירועי המרה (טופס, קליק על CTA, רכישה).
- Search Console: אימות דומיין דרך DNS, הגשת sitemap, מעקב אחרי Core Web Vitals ושגיאות אינדוקס.
- מפות חום: Microsoft Clarity (חינמי) כברירת מחדל, Hotjar כחלופה.
- באנר הסכמה לעוגיות ו-Consent Mode, כי כל הכלים האלה אוספים מידע על גולשים.

עדכון `write-feature-spec`: לכל פיצ'ר להגדיר מראש איזה אירוע מודד אותו.
עדכון `security-expert`: סקריפט צד שלישי חדש = trigger לבדיקה.

### v3: צמיחה ולוטש (A/B, ביקורות, אנימציות)

סקיל חדש `ab-testing`:
- כלי: GrowthBook או PostHog (Google Optimize נסגר בספטמבר 2023).
- כללים: השערה וגודל מדגם מחושבים לפני ההרצה, מדד הצלחה אחד, לא לעצור מוקדם.
- דורש את v2 (אירועי המרה) ותנועה מספקת. באתר עם מעט גולשים מבחן A/B לא יגיע למובהקות, ועדיף לשנות ולמדוד לפני/אחרי.

סקיל חדש `reviews-testimonials`:
- איסוף: מייל או וואטסאפ אחרי רכישה, קישור ישיר לביקורת Google, טופס באתר עם אישור פרסום.
- הצגה: רק ביקורות אמיתיות עם שם ומקור (ממשיך את הכלל הקיים ב-`drop-generic-design`).
- שים לב: Google לא מציגה כוכבי ביקורת בתוצאות חיפוש לביקורות שעסק מפרסם על עצמו באתר שלו, אז schema של Review לא יביא כוכבים בגוגל במקרה הזה.

סקיל חדש `motion` (הרחבה של שורה 20 ב-`ui-ux-review`):
- משכים 150 עד 300ms למיקרו-אינטראקציות, אנימציה רק על `transform`/`opacity`, `prefers-reduced-motion` חובה.
- דפוסים: hover/focus, מצבי טעינה, משוב אחרי שליחה, מעברי עמוד.

## עיקרון

הטמפלט לא מכיל קוד אתר ולא אמור להכיל. הוא מכיל ידע: סקילים, צ'קליסטים ונקודות בדיקה בצנרת, כך שכל פרויקט אתר שיועתק ממנו יקבל את הנושאים האלה אוטומטית. ערכים ספציפיים (מזהה GA4, דומיין ל-Search Console, מפתחות) נמלאים בכל פרויקט בנפרד ולעולם לא בטמפלט.
