import { FileText, Clock, AlertCircle, Trash2 } from "lucide-react";

const MeetingsList = ({
  meetingList,
  selectedMeetingId,
  onMeetingSelect,
  onMeetingDelete
}) => {
  const truncateFileName = (name, maxLength = 35) => {
    if (!name) return "";
    return name.length > maxLength
      ? name.slice(0, maxLength).trim() + "..."
      : name;
  };

  return (
    <div className="card meetings-card">
      <h2 className="section-title">
        <FileText className="section-icon" />
        Meetings
      </h2>
      <div className="meetings-scroll-wrapper">
        {meetingList.map((meeting, index) => {
          // Create gradient pattern: 1-2-3-4-3-2-1-2-3-4-3-2...
          const pattern = [1, 2, 3, 4, 3, 2];
          const colorClass = `btn-past-${pattern[index % pattern.length]}`;
          const isProcessing = meeting.status_code === "202";
          const hasError = meeting.status_code === "500";
          
          return (
            <div key={meeting.uuid} className="meeting-entry">
              <button
                className={`space btn btn-small ${colorClass} ${
                  selectedMeetingId === meeting.uuid ? "btn-active" : ""
                } ${isProcessing ? "btn-disabled" : ""}`}
                onClick={() => {
                  if (!isProcessing && onMeetingSelect) {
                    onMeetingSelect(meeting.uuid);
                  }
                }}
                disabled={isProcessing}
                title={isProcessing ? "This file is still processing" : ""}
              >
                {truncateFileName(meeting.name)}
                {isProcessing && <Clock className="btn-icon status-icon" />}
                {hasError && <AlertCircle className="btn-icon status-icon error-icon" />}
              </button>
              <button
                className="btn btn-discrete btn-small delete-meeting-btn"
                onClick={() => onMeetingDelete && onMeetingDelete(meeting.uuid)}
                title="Delete Meeting"
              >
                <Trash2 className="btn-icon" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MeetingsList;