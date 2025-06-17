import './App.css';
import {
  BrowserRouter as Router,
  Routes,
  Route
} from 'react-router-dom';

import Home from './Home';
import JobDetail from './JobDetail';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/file/:uuid" element={<JobDetail />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;