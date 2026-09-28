import { sessionValid, sameOrigin } from './auth';
export async function apiGuard(request: Request, mutation = false) {
  if (!(await sessionValid())) return Response.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (mutation && !sameOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  return null;
}
export async function jsonInput(request: Request) {
  const text = await request.text();
  if (text.length > 16000) throw new Error('Request too large.');
  return JSON.parse(text) as unknown;
}
