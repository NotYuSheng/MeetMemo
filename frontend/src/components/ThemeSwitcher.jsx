import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

const CYCLE = ['light', 'dark', 'system'];

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS = {
  light: 'Light mode — click for dark',
  dark: 'Dark mode — click for system',
  system: 'System mode — click for light',
};

function useResolvedDark(themeMode) {
  const [sysDark, setSysDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    if (themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSysDark(mq.matches);
    const handler = (e) => setSysDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeMode]);
  if (themeMode === 'light') return false;
  if (themeMode === 'dark') return true;
  return sysDark;
}

function ThemeSwitcher() {
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('meetmemo-theme') || 'system';
  });

  const isDark = useResolvedDark(themeMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const cycleTheme = () => {
    const next = CYCLE[(CYCLE.indexOf(themeMode) + 1) % CYCLE.length];
    setThemeMode(next);
    localStorage.setItem('meetmemo-theme', next);
  };

  const Icon = ICONS[themeMode];

  return (
    <button
      type="button"
      className="btn btn-sm btn-outline-secondary"
      onClick={cycleTheme}
      aria-label={LABELS[themeMode]}
      title={LABELS[themeMode]}
    >
      <Icon size={16} />
    </button>
  );
}

export default ThemeSwitcher;
