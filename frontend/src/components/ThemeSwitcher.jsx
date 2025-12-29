import { useState } from 'react'
import { Dropdown, Button } from '@govtechsg/sgds-react'
import { Palette } from 'lucide-react'

const THEMES = [
  { id: 'default', name: 'Singapore Blue', color: '#0d6efd' },
  { id: 'teal', name: 'Teal Professional', color: '#00b8ad' },
  { id: 'purple', name: 'Purple Modern', color: '#9333ea' },
  { id: 'emerald', name: 'Emerald Green', color: '#059669' },
  { id: 'indigo', name: 'Indigo Deep', color: '#6366f1' },
  { id: 'rose', name: 'Rose Elegant', color: '#f43f5e' },
  { id: 'orange', name: 'Orange Vibrant', color: '#f97316' },
  { id: 'dark', name: 'Dark Mode', color: '#1a1a1a' },
]

function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState('default')

  const changeTheme = (themeId) => {
    setCurrentTheme(themeId)
    if (themeId === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', themeId)
    }
    // Save to localStorage
    localStorage.setItem('meetmemo-theme', themeId)
  }

  // Load theme from localStorage on mount
  useState(() => {
    const savedTheme = localStorage.getItem('meetmemo-theme')
    if (savedTheme && savedTheme !== 'default') {
      changeTheme(savedTheme)
    }
  }, [])

  const currentThemeName = THEMES.find(t => t.id === currentTheme)?.name || 'Singapore Blue'

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
                  backgroundColor: theme.color,
                  border: theme.id === 'dark' ? '1px solid #fff' : 'none'
                }}
              />
              <span>{theme.name}</span>
            </div>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  )
}

export default ThemeSwitcher
