import ReactMarkdown from 'react-markdown'
import { Sparkles } from 'lucide-react'

export default function SummaryContent({ summary }) {
  if (!summary) {
    return (
      <div className="summary-placeholder text-center text-muted py-5">
        <Sparkles size={48} className="mb-3 opacity-50" />
        <p>AI summary will appear here</p>
      </div>
    )
  }

  return (
    <div className="summary-content">
      {summary.summary && (
        <div className="mb-4">
          <h6 className="mb-3">Summary</h6>
          <ReactMarkdown>{summary.summary}</ReactMarkdown>
        </div>
      )}
      {summary.key_points && summary.key_points.length > 0 && (
        <div className="mb-4">
          <h6 className="mb-3">Key Points</h6>
          <ul>
            {summary.key_points.map((point, idx) => (
              <li key={idx}><ReactMarkdown>{point}</ReactMarkdown></li>
            ))}
          </ul>
        </div>
      )}
      {summary.action_items && summary.action_items.length > 0 && (
        <div className="mb-4">
          <h6 className="mb-3">Action Items</h6>
          <ul>
            {summary.action_items.map((item, idx) => (
              <li key={idx}><ReactMarkdown>{item}</ReactMarkdown></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
