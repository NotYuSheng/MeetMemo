/**
 * Header component with logo and theme toggle
 */

import React from 'react';

interface HeaderProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

const Header: React.FC<HeaderProps> = ({ isDarkMode, onToggleDarkMode }) => {
  return (
    <div className="header-card">
      <h1 className="header-title">
        <img
          src="/logo.png"
          alt="MeetMemo Logo"
          className="header-logo"
        />{" "}
        MeetMemo
      </h1>
      <label className="theme-toggle" style={{ float: "right" }}>
        <input
          type="checkbox"
          checked={isDarkMode}
          onChange={onToggleDarkMode}
        />
        <span className="toggle-slider"></span>
      </label>
      <p className="header-subtitle">
        Record, transcribe, and summarize your meetings with AI-powered insights
      </p>
    </div>
  );
};

export default Header;
