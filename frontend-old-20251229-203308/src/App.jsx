import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import MeetingTranscriptionApp from "./MeetingTranscriptionApp";

function App() {
  return (
    <Router basename="/">
      <div className="App">
        <Routes>
          <Route path="/" element={<MeetingTranscriptionApp />} />
          <Route path="/MeetMemo" element={<MeetingTranscriptionApp />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
