import { useState } from "react";
import { Download, RefreshCw, RotateCcw, Edit } from "lucide-react";

const TranscriptView = ({
  transcript,
  originalTranscript,
  selectedMeetingId,
  speakerNameMaps,
  speakerSuggestions,
  speakerIdentificationLoading,
  transcriptSaveStatus,
  currentSpeakerNameMap,
  onSpeakerNameChange,
  onTranscriptTextChange,
  onIdentifySpeakers,
  onExportTranscript,
  onResetTranscript,
  onApplySpeakerSuggestion,
  onDismissSpeakerSuggestion,
  getSpeakerColor,
  formatSpeakerName,
  getDisplaySpeakerName,
}) => {
  const [editingSpeaker, setEditingSpeaker] = useState(null);
  const [editingTranscriptEntry, setEditingTranscriptEntry] = useState(null);

  const toggleTextEditing = (entryId) => {
    setEditingTranscriptEntry(
      editingTranscriptEntry === entryId ? null : entryId,
    );
  };

  const handleTranscriptTextEdit = (entryId, newText) => {
    if (onTranscriptTextChange) {
      onTranscriptTextChange(entryId, newText);
    }
  };

  if (transcript.length === 0) {
    return (
      <div className="empty-state">
        <Edit className="empty-icon" />
        <p className="empty-title">No transcript available</p>
        <p className="empty-subtitle">
          Start recording or upload an audio file to begin
        </p>
      </div>
    );
  }

  return (
    <div className="transcript-container">
      {transcriptSaveStatus && (
        <div className={`save-status save-status-${transcriptSaveStatus}`}>
          {transcriptSaveStatus === "saving" && "Saving changes..."}
          {transcriptSaveStatus === "saved" && "✓ Changes saved"}
          {transcriptSaveStatus === "error" && "⚠ Error saving changes"}
        </div>
      )}

      <div className="actions-group" style={{ marginBottom: "1rem" }}>
        <button
          onClick={() =>
            selectedMeetingId && onIdentifySpeakers(selectedMeetingId)
          }
          className="btn btn-primary btn-small"
          disabled={!selectedMeetingId || speakerIdentificationLoading}
        >
          <RefreshCw
            className={`btn-icon ${speakerIdentificationLoading ? "spinning" : ""}`}
          />
          {speakerIdentificationLoading ? "Refreshing..." : "Refresh Speaker"}
        </button>
        <button
          onClick={onResetTranscript}
          className="btn btn-warning btn-small"
          disabled={
            !originalTranscript.length || originalTranscript.length === 0
          }
          title="Reset all transcript edits to original"
        >
          <RotateCcw className="btn-icon" />
          Reset Edits
        </button>
        <button
          onClick={onExportTranscript}
          className="btn btn-success btn-small"
        >
          <Download className="btn-icon" />
          Export JSON
        </button>
      </div>

      {transcript.map((entry) => (
        <div key={entry.id} className="transcript-entry">
          <div className="transcript-header">
            {editingSpeaker === entry.originalSpeaker ? (
              <div className="speaker-edit-container">
                <input
                  type="text"
                  defaultValue={formatSpeakerName(
                    entry.speaker ?? "SPEAKER_00",
                  )}
                  onBlur={(e) => {
                    onSpeakerNameChange(entry.originalSpeaker, e.target.value);
                    setEditingSpeaker(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onSpeakerNameChange(
                        entry.originalSpeaker,
                        e.target.value,
                      );
                      setEditingSpeaker(null);
                    }
                  }}
                />
                <button
                  onClick={() => setEditingSpeaker(null)}
                  className="btn btn-success btn-small"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="speaker-container">
                <div className="speaker-name-row">
                  <span
                    className={`speaker-badge ${getSpeakerColor(entry.speakerId)}`}
                  >
                    {getDisplaySpeakerName(
                      entry.speaker,
                      entry.originalSpeaker,
                      currentSpeakerNameMap,
                    )}
                  </span>
                  <button
                    onClick={() => setEditingSpeaker(entry.originalSpeaker)}
                    className="btn btn-secondary btn-small rename-speaker-btn"
                  >
                    Rename
                  </button>
                </div>
                {/* Speaker Suggestion */}
                {speakerSuggestions &&
                  speakerSuggestions[formatSpeakerName(entry.speaker)] &&
                  speakerSuggestions[formatSpeakerName(entry.speaker)] !==
                    "Cannot be determined" &&
                  !speakerSuggestions[formatSpeakerName(entry.speaker)]
                    .toLowerCase()
                    .includes("cannot be determined") && (
                    <div className="speaker-suggestion">
                      <span className="suggestion-text">
                        AI suggests:{" "}
                        {speakerSuggestions[formatSpeakerName(entry.speaker)]}
                      </span>
                      <button
                        onClick={() =>
                          onApplySpeakerSuggestion(
                            entry.originalSpeaker,
                            speakerSuggestions[
                              formatSpeakerName(entry.speaker)
                            ],
                          )
                        }
                        className="btn btn-success btn-small apply-suggestion-btn"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() =>
                          onDismissSpeakerSuggestion(
                            formatSpeakerName(entry.speaker),
                          )
                        }
                        className="btn btn-secondary btn-small dismiss-suggestion-btn"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
              </div>
            )}
            <span className="timestamp">
              {entry.start}s - {entry.end}s
            </span>
          </div>
          <div className="transcript-content">
            {editingTranscriptEntry === entry.id ? (
              <div
                className="transcript-text editable"
                contentEditable
                suppressContentEditableWarning={true}
                autoFocus
                onBlur={(e) => {
                  const newText = e.target.textContent;
                  handleTranscriptTextEdit(entry.id, newText);
                  setEditingTranscriptEntry(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const newText = e.target.textContent;
                    handleTranscriptTextEdit(entry.id, newText);
                    setEditingTranscriptEntry(null);
                  } else if (e.key === "Escape") {
                    e.target.textContent = entry.text; // Restore original text
                    setEditingTranscriptEntry(null);
                  }
                }}
                dangerouslySetInnerHTML={{ __html: entry.text }}
              />
            ) : (
              <p
                className="transcript-text clickable"
                onClick={() => toggleTextEditing(entry.id)}
                title="Click to edit transcript text"
              >
                {entry.text}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TranscriptView;
