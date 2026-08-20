import { useMemo, useState } from 'react';
import { checkPromotion } from './engine/graduation';
import { useStore } from './store/StoreContext';
import { Home } from './screens/Home';
import { History } from './screens/History';
import { Onboarding } from './screens/Onboarding';
import { Progress } from './screens/Progress';
import { PromotionScreen } from './screens/Promotion';
import { Settings } from './screens/Settings';
import { Workout } from './screens/Workout';

type Tab = 'home' | 'progress' | 'history' | 'settings';

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: 'home',
    label: 'Train',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
      </svg>
    ),
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M21 7v5h-5" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'History',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 2" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
      </svg>
    ),
  },
];

export function App() {
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>('home');
  const [showPromotion, setShowPromotion] = useState(false);
  const promotion = useMemo(() => checkPromotion(state), [state]);

  if (!state.profile || !state.programId) {
    return (
      <div className="app">
        <Onboarding />
      </div>
    );
  }

  if (showPromotion && promotion) {
    return (
      <div className="app">
        <PromotionScreen promotion={promotion} onClose={() => setShowPromotion(false)} />
      </div>
    );
  }

  // A live session takes over the whole screen — no tab bar to fat-finger mid-set.
  if (state.active) {
    return (
      <div className="app app--session">
        <Workout onDone={() => setTab('home')} />
      </div>
    );
  }

  return (
    <div className="app">
      {tab === 'home' && <Home onPromotion={() => setShowPromotion(true)} />}
      {tab === 'progress' && <Progress />}
      {tab === 'history' && <History />}
      {tab === 'settings' && <Settings />}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
