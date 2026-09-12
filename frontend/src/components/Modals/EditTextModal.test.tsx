import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditTextModal from './EditTextModal';
import type { Transcript } from '../../types/api';
import type { EditingSegment } from '../../hooks/useTranscript';

const transcript: Transcript = {
  segments: [
    { speaker: 'SPEAKER_00', start: 0, end: 2, text: 'a' },
    { speaker: 'SPEAKER_01', start: 2, end: 4, text: 'b' },
  ],
};

const editingSegment: EditingSegment = {
  speaker: 'SPEAKER_00',
  start: 65,
  end: 70,
  text: 'Hello',
  index: 0,
};

describe('EditTextModal', () => {
  it('renders the segment text and timestamp when shown', () => {
    render(
      <EditTextModal
        show
        onHide={vi.fn()}
        editingSegment={editingSegment}
        setEditingSegment={vi.fn()}
        handleSaveSegmentText={vi.fn()}
        transcript={transcript}
        editingSpeakers={{}}
      />
    );
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
    expect(screen.getByText('1:05 - 1:10')).toBeInTheDocument();
  });

  it('updates the segment text on edit', () => {
    const setEditingSegment = vi.fn();
    render(
      <EditTextModal
        show
        onHide={vi.fn()}
        editingSegment={editingSegment}
        setEditingSegment={setEditingSegment}
        handleSaveSegmentText={vi.fn()}
        transcript={transcript}
        editingSpeakers={{}}
      />
    );
    fireEvent.change(screen.getByDisplayValue('Hello'), { target: { value: 'Hello world' } });
    expect(setEditingSegment).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello world' })
    );
  });

  it('saves changes via the handler', () => {
    const handleSaveSegmentText = vi.fn();
    render(
      <EditTextModal
        show
        onHide={vi.fn()}
        editingSegment={editingSegment}
        setEditingSegment={vi.fn()}
        handleSaveSegmentText={handleSaveSegmentText}
        transcript={transcript}
        editingSpeakers={{}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(handleSaveSegmentText).toHaveBeenCalled();
  });
});
