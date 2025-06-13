const express = require('express');
const multer = require('multer');
const path = require('path');
const app = express();
const port = 4000;

// Store uploaded files in the shared volume
const upload = multer({ dest: '/app/shared/' });

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ filename: req.file.filename, path: req.file.path });
});

app.listen(port, () => {
  console.log(`Upload server running on port ${port}`);
});
