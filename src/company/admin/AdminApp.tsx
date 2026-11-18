import { useCallback, useEffect, useState } from 'react';
import { auth, myAdminCompany, type Company } from '../api';
import { errorText } from '../invite';
import { MissingKeys } from '../Missing';
import { hasSupabase } from '../supabase';
import { Couriers } from './Couriers';
import { CreateCompany } from './CreateCompany';
import { Login } from './Login';
import { Planner } from './Planner';
import '../theme.css';

type State = { k: 'loading' } | { k: 'out' } | { k: 'no-company' } | { k: 'in'; company: Company } | { k: 'error'; msg: string };

export default function AdminApp() {
  const [s, setS] = useState<State>({ k: 'loading' });
  const [tab, setTab] = useState<'plan' | 'couriers'>('plan');

  const refresh = useCallback(async () => {
    try {
      if (!(await auth.session())) return setS({ k: 'out' });
      const company = await myAdminCompany();
      setS(company ? { k: 'in', company } : { k: 'no-company' });
    } catch (x) { setS({ k: 'error', msg: errorText(x) }); }
  }, []);

  useEffect(() => {
    if (!hasSupabase()) return;
    void refresh();
    const sub = auth.onChange(() => { void refresh(); });
    return () => sub.unsubscribe();
  }, [refresh]);

  useEffect(() => { document.title = 'PassIT מנהל'; document.body.style.background = '#0A0E17';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0A0E17'); }, []);

  return (
    <main className="co" dir="rtl" lang="he">
      <div className="co-wrap">
        <MissingKeys />
        {!hasSupabase() ? null
          : s.k === 'loading' ? <p className="co-muted">טוען...</p>
          : s.k === 'out' ? <Login />
          : s.k === 'no-company' ? <CreateCompany onDone={refresh} />
          : s.k === 'error' ? <div className="co-msg bad" role="alert">{s.msg} <button type="button" onClick={refresh}>נסה שוב</button></div>
          : (
            <>
              <header className="co-head">
                <div className="co-brand">
                  <div className="co-logo">P</div>
                  <div><b>PassIT</b><span className="co-muted co-small">מרכז שליטה · {s.company.name}</span></div>
                </div>
                <div className="co-actions">
                  <nav className="co-nav" aria-label="מסכים">
                    <button type="button" aria-current={tab === 'plan' ? 'page' : undefined} onClick={() => setTab('plan')}>מסלול</button>
                    <button type="button" aria-current={tab === 'couriers' ? 'page' : undefined} onClick={() => setTab('couriers')}>שליחים</button>
                  </nav>
                  <button type="button" className="co-quiet" onClick={() => auth.signOut()}>יציאה</button>
                </div>
              </header>
              {tab === 'plan' ? <Planner company={s.company} onInvite={() => setTab('couriers')} /> : <Couriers company={s.company} />}
            </>
          )}
      </div>
    </main>
  );
}
