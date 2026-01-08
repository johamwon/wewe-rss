import type { Env } from '../types';

export interface TrpcContext {
  env: Env;
  authError: string | null;
}

export function createContext(env: Env, req: Request): TrpcContext {
  const authCode = env.AUTH_CODE?.trim();
  const requestAuth = req.headers.get('authorization') || '';
  const authError = authCode && requestAuth !== authCode ? 'authCode不正确！' : null;

  return { env, authError };
}
