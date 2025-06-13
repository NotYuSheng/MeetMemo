const express = require('express');
const multer = require('multer');
const path = require('path');
const app = express();
const port = 4000;

// Store uploaded files in the shared volume
const upload = multer({ dest: '/app/shared/' });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Save path so /jobs can access it
  const filepath = path.resolve(req.file.path);
  console.log('Received file at:', filepath);

  res.json({ path: filepath }); // Respond with file path
});
app.listen(port, () => {
  console.log(`Upload server running on port ${port}`);
});
