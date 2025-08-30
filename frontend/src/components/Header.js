const Header = ({ isDarkMode, onToggleDarkMode }) => {
  return (
    <div className="header-card">
      <h1 className="header-title">
        <img
          src={process.env.PUBLIC_URL + "/logo.png"}
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
