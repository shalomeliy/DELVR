// Which app a path opens: "/" solo courier (as before), "/admin" company admin, "/c" company courier.
export type Mode = 'solo' | 'admin' | 'courier';

export function modeFor(pathname: string): Mode {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  if (p === '/c' || p.startsWith('/c/')) return 'courier';
  return 'solo';
}
