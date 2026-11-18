// Which app a path opens: "/" solo courier (as before), "/admin" company admin, "/c" company courier.
export type Mode = 'solo' | 'admin' | 'courier';

export function modeFor(pathname: string): Mode {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  if (p === '/c' || p.startsWith('/c/')) return 'courier';
  return 'solo';
}

// Each company app installs as its own home-screen app, with its own name, icon and start page.
export type Identity = { title: string; manifest: string; icon: string; appleIcon: string };

export function identityFor(mode: Mode): Identity | null {
  if (mode === 'admin') return { title: 'PassIT מנהל', manifest: '/admin.webmanifest', icon: '/admin-192.png', appleIcon: '/admin-apple-touch-icon.png' };
  if (mode === 'courier') return { title: 'PassIT שליח', manifest: '/courier.webmanifest', icon: '/courier-192.png', appleIcon: '/courier-apple-touch-icon.png' };
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
