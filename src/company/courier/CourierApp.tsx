import { MissingKeys } from '../Missing';
import '../theme.css';

// Placeholder for slice 1. The invite link, the route and the marks come in slice 4.
export default function CourierApp() {
  return (
    <main className="co" dir="rtl">
      <h1 className="co-title">PassIT <span className="co-live">שליח</span></h1>
      <MissingKeys />
      <p className="co-muted">המסלול שלך יופיע כאן.</p>
    </main>
  );
}
