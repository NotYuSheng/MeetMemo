import { useState, useEffect, useCallback } from 'react';
import { Dropdown } from '@govtechsg/sgds-react';
import { Palette } from 'lucide-react';

const THEMES = [
  { id: 'system', name: 'System', color: 'linear-gradient(135deg, #ffffff 50%, #1a1a1a 50%)' },
  { id: 'default', name: 'Singapore Blue', color: '#0d6efd' },
  { id: 'teal', name: 'Teal Professional', color: '#00b8ad' },
  { id: 'purple', name: 'Purple Modern', color: '#9333ea' },
  { id: 'emerald', name: 'Emerald Green', color: '#059669' },
  { id: 'indigo', name: 'Indigo Deep', color: '#6366f1' },
  { id: 'rose', name: 'Rose Elegant', color: '#f43f5e' },
  { id: 'orange', name: 'Orange Vibrant', color: '#f97316' },
  { id: 'dark', name: 'Dark Mode', color: '#1a1a1a' },
];

// Get system preference
const getSystemTheme = () => {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'default';
};

function ThemeSwitcher() {
  // Initialize with saved theme or default to 'system'
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('meetmemo-theme') || 'system';
  });

  // Apply theme to document
  const applyTheme = useCallback((themeId) => {
    const themeToApply = themeId === 'system' ? getSystemTheme() : themeId;

    if (themeToApply === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', themeToApply);
    }
  }, []);

  const changeTheme = (themeId) => {
    setCurrentTheme(themeId);
    applyTheme(themeId);
    localStorage.setItem('meetmemo-theme', themeId);
  };

  // Apply theme on mount and when currentTheme changes
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme, applyTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (currentTheme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [currentTheme, applyTheme]);

  const currentThemeName = THEMES.find((t) => t.id === currentTheme)?.name || 'System';

  return (
    <Dropdown>
      <Dropdown.Toggle variant="outline-secondary" size="sm" id="theme-dropdown">
        <Palette size={16} className="me-2" />
        {currentThemeName}
      </Dropdown.Toggle>

      <Dropdown.Menu>
        {THEMES.map((theme) => (
          <Dropdown.Item
            key={theme.id}
            onClick={() => changeTheme(theme.id)}
            active={currentTheme === theme.id}
          >
            <div className="d-flex align-items-center gap-2">
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  background: theme.color,
                  border: theme.id === 'dark' || theme.id === 'system' ? '1px solid #aaa' : 'none',
                }}
              />
              <span>{theme.name}</span>
            </div>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default ThemeSwitcher;
