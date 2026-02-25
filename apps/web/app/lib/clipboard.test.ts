import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  const originalExecCommand = document.execCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset clipboard to happy-dom's default
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    document.execCommand = originalExecCommand;
    window.isSecureContext = true;

    // Clean up any textarea elements that might be left
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(ta => ta.remove());
  });

  it('copies text using modern Clipboard API when available', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    const result = await copyToClipboard('test text');

    expect(result).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith('test text');
  });

  it('falls back to execCommand when Clipboard API fails', async () => {
    const mockWriteText = vi.fn().mockRejectedValue(new Error('Not allowed'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    // Mock execCommand to succeed
    document.execCommand = vi.fn(() => true) as any;

    const result = await copyToClipboard('test text');

    expect(result).toBe(true);
    expect(mockWriteText).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('uses fallback when Clipboard API is not available', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    window.isSecureContext = false;

    // Mock execCommand to succeed
    document.execCommand = vi.fn(() => true) as any;

    const result = await copyToClipboard('fallback test');

    expect(result).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('returns false when both methods fail', async () => {
    const mockWriteText = vi.fn().mockRejectedValue(new Error('Failed'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    // Mock execCommand to fail
    document.execCommand = vi.fn(() => false) as any;

    const result = await copyToClipboard('test text');

    expect(result).toBe(false);
  });

  it('creates and removes textarea element in fallback mode', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    window.isSecureContext = false;

    let textareaCreated = false;
    let textareaRemoved = false;

    const originalAppendChild = document.body.appendChild;
    const originalRemoveChild = document.body.removeChild;

    document.body.appendChild = vi.fn((element) => {
      if (element instanceof HTMLTextAreaElement) {
        textareaCreated = true;
      }
      return originalAppendChild.call(document.body, element);
    }) as any;

    document.body.removeChild = vi.fn((element) => {
      if (element instanceof HTMLTextAreaElement) {
        textareaRemoved = true;
      }
      return originalRemoveChild.call(document.body, element);
    }) as any;

    document.execCommand = vi.fn(() => true) as any;

    await copyToClipboard('test');

    expect(textareaCreated).toBe(true);
    expect(textareaRemoved).toBe(true);

    // Restore
    document.body.appendChild = originalAppendChild;
    document.body.removeChild = originalRemoveChild;
  });

  it('handles empty string correctly', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    const result = await copyToClipboard('');

    expect(result).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith('');
  });

  it('handles special characters in text', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    const specialText = 'Hello\nWorld\t!@#$%^&*()';
    const result = await copyToClipboard(specialText);

    expect(result).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith(specialText);
  });

  it('handles long text content', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    const longText = 'a'.repeat(10000);
    const result = await copyToClipboard(longText);

    expect(result).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith(longText);
  });

  it('cleans up textarea element even when execCommand throws', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    window.isSecureContext = false;

    let textareaRemoved = false;

    const originalRemoveChild = document.body.removeChild;
    document.body.removeChild = vi.fn((element) => {
      if (element instanceof HTMLTextAreaElement) {
        textareaRemoved = true;
      }
      return originalRemoveChild.call(document.body, element);
    }) as any;

    document.execCommand = vi.fn(() => {
      throw new Error('Command failed');
    }) as any;

    const result = await copyToClipboard('test');

    expect(result).toBe(false);
    expect(textareaRemoved).toBe(true);

    // Restore
    document.body.removeChild = originalRemoveChild;
  });
});
