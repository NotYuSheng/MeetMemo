import { useState } from "react";
import { Download, Hash } from "lucide-react";
import PDFViewer from "./PDFViewer";

const SummaryView = ({
  summary,
  summaryLoading,
  selectedMeetingId,
  customPrompt,
  systemPrompt,
  showPromptInputs,
  onCustomPromptChange,
  onSystemPromptChange,
  onTogglePromptInputs,
  onRegenerateSummary,
  onExportMarkdown,
  onExportPDF,
  onRename,
  isPdfLoaded,
  onPdfLoaded,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const handleRename = () => {
    if (onRename) {
      onRename(newName);
    }
    setIsRenaming(false);
  };

  if (summaryLoading) {
    return (
      <div className="processing-indicator">
        <div className="spinner"></div>
        <span>Generating summary with AI…</span>
      </div>
    );
  }

  if (!summary || !summary.meetingTitle) {
    return (
      <div className="empty-state">
        <Hash className="empty-icon" />
        <p className="empty-title">No summary available</p>
        <p className="empty-subtitle">
          Summary will appear after processing audio
        </p>
      </div>
    );
  }

  return (
    <div className="summary-content">
      <div className="summary-actions-group" style={{ marginBottom: "1rem" }}>
        <button
          onClick={onTogglePromptInputs}
          className="btn btn-secondary btn-small"
        >
          {showPromptInputs ? "Hide Prompts" : "Custom Prompts"}
        </button>
        <button
          onClick={onExportMarkdown}
          className="btn btn-success btn-small"
        >
          <Download className="btn-icon" />
          Export Markdown
        </button>
        <button onClick={onExportPDF} className="btn btn-success btn-small">
          <Download className="btn-icon" />
          Export PDF
        </button>
      </div>

      {/* Custom Prompts Section */}
      {showPromptInputs && (
        <div className="custom-prompts-section">
          <div className="prompt-input-group">
            <label htmlFor="system-prompt">System Prompt (Optional):</label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="e.g., You are a helpful assistant that summarizes meeting transcripts with focus on technical decisions..."
              className="prompt-textarea"
              rows={3}
            />
          </div>
          <div className="prompt-input-group">
            <label htmlFor="custom-prompt">
              Custom User Prompt (Optional):
            </label>
            <textarea
              id="custom-prompt"
              value={customPrompt}
              onChange={(e) => onCustomPromptChange(e.target.value)}
              placeholder="e.g., Please summarize this meeting focusing on action items and deadlines..."
              className="prompt-textarea"
              rows={3}
            />
          </div>
          <button
            onClick={() => onRegenerateSummary(selectedMeetingId)}
            className="btn btn-primary btn-small"
            disabled={!selectedMeetingId}
          >
            Regenerate Summary
          </button>
        </div>
      )}

      {isRenaming ? (
        <div className="rename-container">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rename-input"
          />
          <div className="rename-buttons-group">
            <button
              onClick={handleRename}
              className="btn btn-success btn-small"
            >
              Save
            </button>
            <button
              onClick={() => setIsRenaming(false)}
              className="btn btn-secondary btn-small"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p>
          <strong>File Name:</strong> {summary.meetingTitle}
          <button
            onClick={() => {
              setIsRenaming(true);
              setNewName(summary.meetingTitle);
            }}
            className="btn btn-secondary btn-small rename-btn"
          >
            Rename
          </button>
        </p>
      )}
      <div className="summary-pdf">
        <PDFViewer
          selectedMeetingId={selectedMeetingId}
          onPdfLoaded={onPdfLoaded}
        />
      </div>
    </div>
  );
};

export default SummaryView;
