import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TranscriptSegment from './TranscriptSegment';
import type { TranscriptSegment as TranscriptSegmentType } from '../../types/api';

const segment: TranscriptSegmentType = {
  speaker: 'SPEAKER_00',
  start: 65,
  end: 70,
  text: 'Welcome everyone',
};

describe('TranscriptSegment', () => {
  it('renders the speaker, text, and formatted timestamps', () => {
    render(
      <TranscriptSegment
        segment={segment}
        index={0}
        handleEditText={vi.fn()}
        isActive={false}
        onSeekToSegment={vi.fn()}
      />
    );
    expect(screen.getByText('SPEAKER_00')).toBeInTheDocument();
    expect(screen.getByText('Welcome everyone')).toBeInTheDocument();
    expect(screen.getByText('1:05 - 1:10')).toBeInTheDocument();
  });

  it('seeks to the segment start when clicked', () => {
    const onSeekToSegment = vi.fn();
    render(
      <TranscriptSegment
        segment={segment}
        index={0}
        handleEditText={vi.fn()}
        isActive={false}
        onSeekToSegment={onSeekToSegment}
      />
    );
    fireEvent.click(screen.getByText('Welcome everyone'));
    expect(onSeekToSegment).toHaveBeenCalledWith(65);
  });

  it('opens the edit modal without also seeking', () => {
    const handleEditText = vi.fn();
    const onSeekToSegment = vi.fn();
    render(
      <TranscriptSegment
        segment={segment}
        index={3}
        handleEditText={handleEditText}
        isActive={false}
        onSeekToSegment={onSeekToSegment}
      />
    );
    fireEvent.click(screen.getByTitle('Edit this segment'));
    expect(handleEditText).toHaveBeenCalledWith(segment, 3);
    expect(onSeekToSegment).not.toHaveBeenCalled();
  });
});
