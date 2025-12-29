/**
 * Main App component with routing
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MeetingTranscriptionPage from './pages/MeetingTranscriptionPage';
import './App.css';

const App: React.FC = () => {
  return (
    <Router basename="/">
      <div className="App">
        <Routes>
          <Route path="/" element={<MeetingTranscriptionPage />} />
          <Route path="/meeting/:meetingId" element={<MeetingTranscriptionPage />} />
          <Route path="/MeetMemo" element={<MeetingTranscriptionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
