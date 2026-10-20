import { handleOptimize } from './_lib/optimize.js';

// GOOGLE_ROUTES_KEY is the server-only key. Until it is set, fall back to the browser key so sorting still works.
export async function POST(request: Request): Promise<Response> {
  return handleOptimize(request, process.env.GOOGLE_ROUTES_KEY || process.env.VITE_GOOGLE_MAPS_KEY);
}
