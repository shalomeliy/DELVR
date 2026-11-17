import { MissingKeys } from '../Missing';
import '../theme.css';

// Placeholder for slice 1: proves the route, the separate chunk and the keys. Login and screens come in slice 2.
export default function AdminApp() {
  return (
    <main className="co" dir="rtl">
      <h1 className="co-title">PassIT <span className="co-live">מנהל</span></h1>
      <MissingKeys />
      <p className="co-muted">ממשק המנהל בבנייה.</p>
    </main>
  );
}
