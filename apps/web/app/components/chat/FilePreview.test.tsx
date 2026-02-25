import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilePreview } from './FilePreview';
import type { MessageFile } from '@chatwithme/shared';

const createMockFile = (
  fileName: string,
  mimeType: string,
  size: number = 1024
): MessageFile => ({
  url: 'https://example.com/file',
  fileName,
  mimeType,
  size,
});

describe('FilePreview', () => {
  it('renders image preview correctly', () => {
    const imageFile = createMockFile('photo.jpg', 'image/jpeg', 512000);
    const onRemove = vi.fn();

    render(<FilePreview file={imageFile} onRemove={onRemove} index={0} />);

    const img = screen.getByRole('img', { name: /photo\.jpg/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/file');
  });

  it('renders PDF file preview correctly', () => {
    const pdfFile = createMockFile('document.pdf', 'application/pdf', 102400);
    const onRemove = vi.fn();

    render(<FilePreview file={pdfFile} onRemove={onRemove} index={0} />);

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
    expect(screen.getByText('100.0 KB')).toBeInTheDocument();
  });

  it('renders code file preview correctly', () => {
    const codeFile = createMockFile('script.js', 'text/javascript', 2048);
    const onRemove = vi.fn();

    render(<FilePreview file={codeFile} onRemove={onRemove} index={0} />);

    expect(screen.getByText('script.js')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('renders file size in bytes for small files', () => {
    const smallFile = createMockFile('tiny.txt', 'text/plain', 512);
    const onRemove = vi.fn();

    render(<FilePreview file={smallFile} onRemove={onRemove} index={0} />);

    expect(screen.getByText('512 B')).toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', () => {
    const file = createMockFile('file.txt', 'text/plain', 1024);
    const onRemove = vi.fn();

    render(<FilePreview file={file} onRemove={onRemove} index={2} />);

    const removeButton = screen.getByRole('button');
    fireEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('shows progress percentage when processing', () => {
    const file = createMockFile('file.pdf', 'application/pdf', 1024000);
    const onRemove = vi.fn();

    render(
      <FilePreview file={file} onRemove={onRemove} index={0} progress={0.5} />
    );

    // Multiple "50%" elements exist (in file info and progress overlay)
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
  });

  it('disables remove button when processing', () => {
    const file = createMockFile('file.txt', 'text/plain', 1024);
    const onRemove = vi.fn();

    render(
      <FilePreview file={file} onRemove={onRemove} index={0} progress={0.3} />
    );

    const removeButton = screen.getByRole('button');
    expect(removeButton).toBeDisabled();

    fireEvent.click(removeButton);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('shows 100% when progress is complete', () => {
    const file = createMockFile('file.pdf', 'application/pdf', 1024000);
    const onRemove = vi.fn();

    render(
      <FilePreview file={file} onRemove={onRemove} index={0} progress={1} />
    );

    // Progress of 1 means complete (isProcessing = false), should show file size
    // 1024000 bytes = 1000.0 KB (not 1.0 MB because formatFileSize uses 1024*1024 for MB)
    expect(screen.getByText('1000.0 KB')).toBeInTheDocument();
  });

  it('truncates long filenames', () => {
    const longNameFile = createMockFile(
      'very-long-filename-that-should-be-truncated-in-the-preview.txt',
      'text/plain',
      1024
    );
    const onRemove = vi.fn();

    render(<FilePreview file={longNameFile} onRemove={onRemove} index={0} />);

    const fileName = screen.getByText(/very-long-filename/);
    expect(fileName).toBeInTheDocument();
    expect(fileName.className).toContain('truncate');
  });

  it('applies correct styling for non-image files', () => {
    const file = createMockFile('file.txt', 'text/plain', 1024);
    const onRemove = vi.fn();

    const { container } = render(
      <FilePreview file={file} onRemove={onRemove} index={0} />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('max-w-[200px]');
    expect(wrapper.className).not.toContain('w-16');
  });

  it('applies correct styling for image files', () => {
    const file = createMockFile('photo.jpg', 'image/jpeg', 1024);
    const onRemove = vi.fn();

    const { container } = render(
      <FilePreview file={file} onRemove={onRemove} index={0} />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('w-16');
    expect(wrapper.className).toContain('h-16');
  });

  it('does not show progress when progress is undefined', () => {
    const file = createMockFile('file.pdf', 'application/pdf', 1024000);
    const onRemove = vi.fn();

    render(<FilePreview file={file} onRemove={onRemove} index={0} />);

    expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
  });

  it('shows Processing text for partial progress', () => {
    const file = createMockFile('file.pdf', 'application/pdf', 1024000);
    const onRemove = vi.fn();

    render(
      <FilePreview file={file} onRemove={onRemove} index={0} progress={0.75} />
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('passes index correctly to onRemove callback', () => {
    const file = createMockFile('file.txt', 'text/plain', 1024);
    const onRemove = vi.fn();

    render(<FilePreview file={file} onRemove={onRemove} index={5} />);

    const removeButton = screen.getByRole('button');
    fireEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalledWith(5);
  });
});
