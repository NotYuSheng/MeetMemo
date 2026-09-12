import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import FileUploadCard from './FileUploadCard';

function renderCard(overrides: Partial<Parameters<typeof FileUploadCard>[0]> = {}) {
  const props = {
    uploading: false,
    fileInputRef: createRef<HTMLInputElement>(),
    handleFileSelect: vi.fn(),
    handleDragOver: vi.fn(),
    handleDrop: vi.fn(),
    selectedLanguage: null,
    onLanguageChange: vi.fn(),
    ...overrides,
  };
  render(<FileUploadCard {...props} />);
  return props;
}

describe('FileUploadCard', () => {
  it('renders the language selector with an auto-detect default', () => {
    renderCard();
    expect(screen.getByText('Auto-detect')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('reports a chosen language (and maps the empty option to null)', () => {
    const onLanguageChange = renderCard().onLanguageChange;
    const select = screen.getByRole('combobox');

    fireEvent.change(select, { target: { value: 'es' } });
    expect(onLanguageChange).toHaveBeenCalledWith('es');

    fireEvent.change(select, { target: { value: '' } });
    expect(onLanguageChange).toHaveBeenCalledWith(null);
  });

  it('forwards a selected file to the handler', () => {
    const { handleFileSelect } = renderCard();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'meeting.mp3', { type: 'audio/mpeg' });

    fireEvent.change(input, { target: { files: [file] } });
    expect(handleFileSelect).toHaveBeenCalledTimes(1);
  });
});
