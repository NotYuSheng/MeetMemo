import './App.css';

function App() {
  const [fileNames, setFileNames] = useState([]);

  useEffect(() => {
    fetch("http://localhost:8000/checkfiles")
      .then(res => res.json())
      .then(data => setFileNames(data))
      .catch(err => console.error("Failed to fetch file names:", err));
  }, []);

  return (
    <div className="App">
      <header className="App-header">
          Meet Memo
      </header>
      <div className='Padded-text'>
        <h1>All transcriptions</h1>

      </div>
    </div>
  );
}

export default App;
