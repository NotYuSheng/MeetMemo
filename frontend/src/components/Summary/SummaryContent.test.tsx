import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryContent from './SummaryContent';

describe('SummaryContent', () => {
  it('shows a placeholder when there is no summary', () => {
    render(<SummaryContent summary={null} />);
    expect(screen.getByText('AI summary will appear here')).toBeInTheDocument();
  });

  it('renders the summary text, key points, and action items', () => {
    render(
      <SummaryContent
        summary={{
          summary: 'The team discussed the roadmap.',
          key_points: ['Ship v2', 'Hire designer'],
          action_items: ['Email stakeholders'],
        }}
      />
    );

    expect(screen.getByText('The team discussed the roadmap.')).toBeInTheDocument();
    expect(screen.getByText('Key Points')).toBeInTheDocument();
    expect(screen.getByText('Ship v2')).toBeInTheDocument();
    expect(screen.getByText('Action Items')).toBeInTheDocument();
    expect(screen.getByText('Email stakeholders')).toBeInTheDocument();
  });

  it('omits empty sections', () => {
    render(<SummaryContent summary={{ summary: 'Just a summary.' }} />);
    expect(screen.queryByText('Key Points')).not.toBeInTheDocument();
    expect(screen.queryByText('Action Items')).not.toBeInTheDocument();
  });
});
