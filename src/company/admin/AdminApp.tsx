import { useCallback, useEffect, useState } from 'react';
import { auth, myAdminCompany, type Company } from '../api';
import { errorText } from '../invite';
import { MissingKeys } from '../Missing';
import { hasSupabase } from '../supabase';
import { Couriers } from './Couriers';
import { CreateCompany } from './CreateCompany';
import { Login } from './Login';
import { Calendar } from './Calendar';
import { Planner, type PlanTarget } from './Planner';
import { israelDay } from '../time';
import { Search } from './Search';
import { Settings } from './Settings';
import '../theme.css';

type State = { k: 'loading' } | { k: 'out' } | { k: 'no-company' } | { k: 'in'; company: Company } | { k: 'error'; msg: string };

export default function AdminApp() {
  const [s, setS] = useState<State>({ k: 'loading' });
  const [tab, setTab] = useState<'plan' | 'calendar' | 'couriers' | 'search' | 'settings'>('plan');
  const [target, setTarget] = useState<PlanTarget>(() => ({ courierId: null, day: israelDay() }));

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
                <div className="co-head-tools">
                  <button type="button" className="co-quiet co-gear" aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => setTab('settings')}>
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
                    הגדרות
                  </button>
                  <button type="button" className="co-quiet" onClick={() => auth.signOut()}>יציאה</button>
                </div>
              </header>
              <nav className="co-nav co-nav-main" aria-label="מסכים">
                <button type="button" aria-current={tab === 'plan' ? 'page' : undefined} onClick={() => setTab('plan')}>מסלול</button>
                <button type="button" aria-current={tab === 'calendar' ? 'page' : undefined} onClick={() => setTab('calendar')}>יומן</button>
                <button type="button" aria-current={tab === 'couriers' ? 'page' : undefined} onClick={() => setTab('couriers')}>שליחים</button>
                <button type="button" aria-current={tab === 'search' ? 'page' : undefined} onClick={() => setTab('search')}>חיפוש</button>
              </nav>
              {tab === 'plan' ? <Planner company={s.company} target={target} onTarget={setTarget} onCalendar={() => setTab('calendar')} onInvite={() => setTab('couriers')} />
                : tab === 'calendar' ? <Calendar company={s.company} day={target.day} onDay={(day) => setTarget((t) => ({ ...t, day }))}
                    onOpen={(courierId, day) => { setTarget({ courierId: courierId || target.courierId, day }); setTab('plan'); }} />
                : tab === 'couriers' ? <Couriers company={s.company} />
                : tab === 'search' ? <Search company={s.company} />
                : <Settings company={s.company} onBack={() => setTab('plan')} />}
            </>
          )}
      </div>
    </main>
  );
}
