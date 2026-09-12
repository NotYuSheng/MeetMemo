import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorkflowSteps from './WorkflowSteps';

describe('WorkflowSteps', () => {
  it('renders all four workflow step labels', () => {
    render(<WorkflowSteps currentStep="upload" />);
    expect(screen.getByText('Upload Audio')).toBeInTheDocument();
    expect(screen.getByText('AI Processing')).toBeInTheDocument();
    expect(screen.getByText('Review Transcript')).toBeInTheDocument();
    expect(screen.getByText('Get Summary')).toBeInTheDocument();
  });

  it('marks the current step as active', () => {
    render(<WorkflowSteps currentStep="transcript" />);
    const activeLabel = screen.getByText('Review Transcript');
    // The label lives inside the `.step` element that carries the `active` class.
    expect(activeLabel.closest('.step')).toHaveClass('active');
  });
});
