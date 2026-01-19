import { Card, Form } from '@govtechsg/sgds-react';
import { Upload as UploadIcon } from 'lucide-react';
import { WHISPER_LANGUAGES } from '../../constants/languages';

export default function FileUploadCard({
  uploading,
  selectedFile,
  fileInputRef,
  handleFileSelect,
  handleDragOver,
  handleDrop,
  selectedLanguage,
  onLanguageChange,
}) {
  return (
    <Card className="h-100 upload-card">
      <Card.Body className="text-center p-5">
        <div className="upload-icon my-4">
          <UploadIcon size={64} strokeWidth={1.5} className="text-primary" />
        </div>
        <h4 className="mb-3">Upload Audio File</h4>

        {/* Language Selector */}
        <div className="mb-3" style={{ maxWidth: '300px', margin: '0 auto' }}>
          <Form.Group>
            <Form.Label className="text-start d-block">
              <small className="text-muted">Transcription Language</small>
            </Form.Label>
            <Form.Select
              value={selectedLanguage || ''}
              onChange={(e) => onLanguageChange(e.target.value || null)}
              disabled={uploading}
              size="sm"
            >
              {WHISPER_LANGUAGES.map((lang) => (
                <option key={lang.code || 'auto'} value={lang.code || ''}>
                  {lang.name}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </div>

        <div
          className="upload-dropzone mb-3"
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ cursor: uploading ? 'default' : 'pointer' }}
        >
          <p className="mb-2">
            <strong>Click to browse</strong> or drag & drop
          </p>
          <small className="text-muted">Supports MP3, WAV, M4A, WEBM (max 500MB)</small>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".mp3,.wav,.m4a,.webm,.ogg,.flac,.aac"
          style={{ display: 'none' }}
        />
        {uploading && (
          <div className="text-center">
            <span
              className="spinner-border spinner-border-sm me-2"
              role="status"
              aria-hidden="true"
            ></span>
            <span>Uploading...</span>
          </div>
        )}
        {selectedFile && !uploading && (
          <div className="mt-3">
            <small className="text-success">Selected: {selectedFile.name}</small>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
