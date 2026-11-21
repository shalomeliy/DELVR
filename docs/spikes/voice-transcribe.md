# Spike: recording + server transcription instead of Web Speech

**Status:** built, waiting for real phone tests. Verdict: TBD.

## What it tests

The riskiest assumptions of replacing Chrome's Web Speech API in `AddStops.tsx` and `FailReason.tsx`:

1. MediaRecorder works on iPhone (Safari and home-screen app) and Android Chrome, and OpenAI accepts the file (mp4 / webm).
2. `gpt-4o-mini-transcribe` with `language: he` and an address prompt hears Israeli streets, numbers and cities well enough.
3. Claude Haiku (`claude-haiku-5-5`) turns the raw text into one clean line per address that `parser.js` reads correctly, applies self-corrections ("הרצל 5 לא סליחה 8") and does not invent cities or numbers.
4. The wait after pressing stop (transcription + Haiku) is acceptable for a courier.

## How to run

- Vercel env vars (Production and Preview): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must already be set (the endpoint checks company membership with them).
- Open `https://<site>/spikes/voice-transcribe/` on the phone and sign in with the company admin's email and password.
  The page keeps its own sign-in, so it never replaces a courier's identity on that phone.
- For the iPhone home-screen test: Share > Add to Home Screen from that page, then open it from the icon.
- Each result shows: format and size, time of each step, raw text, Haiku text, and what `parser.js` makes of both.

## Script to read (each on iPhone and Android)

1. Three plain addresses with cities: "הרצל שמונה רחובות, ויצמן ארבע עשרה פתח תקווה, ביאליק שלוש".
2. A self-correction: "הרצל חמש לא סליחה שמונה".
3. Details: "רוטשילד שבע עשרה א דירה ארבע קומה שתיים ראשון לציון".
4. A long list (8-10 addresses) at normal speed, with a short pause between them, outdoors or on the scooter.
5. Failure reason mode: "אממ הלקוח לא היה בבית, התקשרתי פעמיים והוא לא ענה".

## Result

TBD: fill in per phone: did it record, accuracy of raw vs clean, wrong streets/numbers, invented content, seconds waited.
