import { useState, useEffect, useSyncExternalStore } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

type ThemeMode = 'light' | 'dark' | 'system';

const CYCLE: ThemeMode[] = ['light', 'dark', 'system'];

const ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<ThemeMode, string> = {
  light: 'Light mode — click for dark',
  dark: 'Dark mode — click for system',
  system: 'System mode — click for light',
};

const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

// Subscribe to the OS colour-scheme preference as an external store. Using
// useSyncExternalStore keeps the value in sync without calling setState inside
// an effect, and always reflects the live media-query result.
function subscribeSystemDark(callback: () => void): () => void {
  const mq = window.matchMedia(PREFERS_DARK_QUERY);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSystemDark(): boolean {
  return window.matchMedia(PREFERS_DARK_QUERY).matches;
}

function useResolvedDark(themeMode: ThemeMode): boolean {
  const sysDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);
  if (themeMode === 'light') return false;
  if (themeMode === 'dark') return true;
  return sysDark;
}

function ThemeSwitcher() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('meetmemo-theme') as ThemeMode) || 'system';
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
