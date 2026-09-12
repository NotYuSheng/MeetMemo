import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProcessingView from './ProcessingView';

describe('ProcessingView', () => {
  it('renders the processing heading and step labels', () => {
    render(<ProcessingView processingProgress={0} />);
    expect(screen.getByText('Processing Your Meeting')).toBeInTheDocument();
    expect(screen.getByText(/Transcribing with Whisper AI/)).toBeInTheDocument();
  });

  it('reflects the current progress percentage', () => {
    const { rerender } = render(<ProcessingView processingProgress={45} />);
    expect(screen.getByText('45%')).toBeInTheDocument();

    rerender(<ProcessingView processingProgress={100} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
