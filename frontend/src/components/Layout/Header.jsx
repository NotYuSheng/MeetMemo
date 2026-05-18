import { Container } from '@govtechsg/sgds-react';
import { FileText } from 'lucide-react';
import ThemeSwitcher from '../ThemeSwitcher';

export default function Header({ onStartNewMeeting }) {
  return (
    <div className="app-header">
      <Container>
        <div className="d-flex align-items-center justify-content-between py-3">
          <div
            className="d-flex align-items-center gap-3"
            style={{ cursor: 'pointer' }}
            onClick={onStartNewMeeting}
          >
            <FileText size={32} className="text-primary" />
            <div>
              <h4 className="mb-0">MeetMemo</h4>
              <small className="text-muted">AI Meeting Summary</small>
            </div>
          </div>
          <ThemeSwitcher />
        </div>
      </Container>
    </div>
  );
}
