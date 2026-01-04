import { Container } from '@govtechsg/sgds-react'
import { UploadIcon, Users, FileText, Sparkles } from 'lucide-react'

export default function WorkflowSteps({ currentStep }) {
  return (
    <div className="workflow-steps bg-light py-3">
      <Container>
        <div className="steps-container">
          <div className={`step ${currentStep === 'upload' ? 'active' : 'completed'}`}>
            <div className="step-icon">
              <UploadIcon size={20} />
            </div>
            <div className="step-label">Upload Audio</div>
          </div>
          <div className="step-divider"></div>
          <div className={`step ${currentStep === 'processing' ? 'active' : currentStep === 'transcript' || currentStep === 'summary' ? 'completed' : ''}`}>
            <div className="step-icon">
              <Users size={20} />
            </div>
            <div className="step-label">AI Processing</div>
          </div>
          <div className="step-divider"></div>
          <div className={`step ${currentStep === 'transcript' ? 'active' : currentStep === 'summary' ? 'completed' : ''}`}>
            <div className="step-icon">
              <FileText size={20} />
            </div>
            <div className="step-label">Review Transcript</div>
          </div>
          <div className="step-divider"></div>
          <div className={`step ${currentStep === 'summary' ? 'active' : ''}`}>
            <div className="step-icon">
              <Sparkles size={20} />
            </div>
            <div className="step-label">Get Summary</div>
          </div>
        </div>
      </Container>
    </div>
  )
}
