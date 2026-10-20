import { handleOptimize } from './_lib/optimize.js';

export async function POST(request: Request): Promise<Response> {
  return handleOptimize(request, process.env.GOOGLE_ROUTES_KEY);
}
