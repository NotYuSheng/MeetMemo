const express = require('express');
const multer = require('multer');
const path = require('path');
const app = express();
const port = 4000;
const fs = require('fs');


// Store uploaded files in the shared volume
const upload = multer({ dest: '/app/audiofiles/' });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Save path so /jobs can access it
  const filepath = path.resolve(req.file.path);

  const originalName = req.file.originalname; // like "audio.wav"
  const newPath = path.join('audiofiles', req.file.filename + '.wav');
  fs.renameSync(req.file.path, newPath);

  console.log('Received file at:', newPath);

  res.json({ path: filepath }); // Respond with file path
});
app.listen(port, () => {
  console.log(`Upload server running on port ${port}`);
});
