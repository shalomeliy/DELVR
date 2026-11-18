// Which app a path opens: "/" solo courier (as before), "/admin" company admin, "/c" company courier.
export type Mode = 'solo' | 'admin' | 'courier';

/**
 * A dedicated address (its first part ends in "admin" or "courier", like passit-admin.vercel.app) is always that app,
 * whatever the path. A phone treats each address as a separate app, so these never open inside the solo app.
 */
export function hostMode(hostname: string): Mode | null {
  const label = hostname.toLowerCase().split('.')[0] ?? '';
  if (/(^|-)admin$/.test(label)) return 'admin';
  if (/(^|-)courier$/.test(label)) return 'courier';
  return null;
}

export function modeFor(pathname: string, hostname = ''): Mode {
  const byHost = hostMode(hostname);
  if (byHost) return byHost;
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  if (p === '/c' || p.startsWith('/c/')) return 'courier';
  return 'solo';
}

/** Where courier invite links point: from the admin address, the matching courier address; otherwise the same site. */
export function courierOrigin(origin: string): string {
  const u = new URL(origin);
  const [label, ...rest] = u.hostname.split('.');
  if (hostMode(u.hostname) !== 'admin') return u.origin;
  u.hostname = [label.replace(/admin$/i, 'courier'), ...rest].join('.');
  return u.origin;
}

// Each company app installs as its own home-screen app, with its own name, icon and start page.
export type Identity = { title: string; manifest: string; icon: string; appleIcon: string };

export function identityFor(mode: Mode, hostname = ''): Identity | null {
  // On its own address the app covers the whole site ("/"), so the phone installs it from any page there.
  const own = hostMode(hostname) === mode ? '-host' : '';
  if (mode === 'admin') return { title: 'PassIT מנהל', manifest: `/admin${own}.webmanifest`, icon: '/admin-192.png', appleIcon: '/admin-apple-touch-icon.png' };
  if (mode === 'courier') return { title: 'PassIT שליח', manifest: `/courier${own}.webmanifest`, icon: '/courier-192.png', appleIcon: '/courier-apple-touch-icon.png' };
  return null;
}

// Swaps the page's manifest and icons before the browser offers to install, so "/admin" and "/c" never install as the solo app.
export function applyIdentity(id: Identity, doc: Document = document): void {
  const link = (rel: string) => {
    let el = doc.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!el) { el = doc.createElement('link'); el.rel = rel; doc.head.appendChild(el); }
    return el;
  };
  link('manifest').href = id.manifest;
  const icon = link('icon'); icon.type = 'image/png'; icon.href = id.icon;
  link('apple-touch-icon').href = id.appleIcon;
  let title = doc.head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (!title) { title = doc.createElement('meta'); title.name = 'apple-mobile-web-app-title'; doc.head.appendChild(title); }
  title.content = id.title;
  doc.title = id.title;
}
