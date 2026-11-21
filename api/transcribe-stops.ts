import Anthropic from '@anthropic-ai/sdk';
import { handleTranscribe } from './_lib/transcribe.js';

// Two calls in a row (OpenAI, then Haiku): vercel.json gives this function 30 seconds.
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// POST /api/transcribe-stops?mode=stops|reason, body = the raw recording, Authorization = the Supabase access token.
export async function POST(request: Request): Promise<Response> {
  return handleTranscribe(request, {
    openaiKey: process.env.OPENAI_API_KEY,
    anthropic,
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY,
  });
}
