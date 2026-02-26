import { useCallback, useRef } from 'react';
import type { MessageFile } from '@chatwithme/shared';

export interface FileProcessorOptions {
  onProgress?: (fileIndex: number, fileName: string, progress: number) => void;
  onOverallProgress?: (progress: number) => void;
}

interface FileProcessorHookReturn {
  processFiles: (
    files: Array<{ file: File; dataUrl: string }>,
    options?: FileProcessorOptions
  ) => Promise<MessageFile[]>;
  isProcessing: boolean;
}

/**
 * Hook to manage file processing using Web Worker
 * Offloads CPU-intensive text extraction to a separate thread
 */
export function useFileProcessor(): FileProcessorHookReturn {
  const workerRef = useRef<Worker | null>(null);
  const isProcessingRef = useRef(false);

  const processFiles = useCallback(
    async (
      files: Array<{ file: File; dataUrl: string }>,
      options?: FileProcessorOptions
    ): Promise<MessageFile[]> => {
      if (files.length === 0) return [];

      // Lazy load the worker
      if (!workerRef.current) {
        try {
          workerRef.current = new Worker(
            new URL('../workers/fileProcessor.worker.ts', import.meta.url),
            { type: 'module' }
          );
        } catch (error) {
          console.error('[useFileProcessor] Failed to create worker:', error);
          // Fallback to main thread processing
          return Promise.reject(new Error('Worker initialization failed'));
        }
      }

      isProcessingRef.current = true;

      return new Promise((resolve, reject) => {
        const worker = workerRef.current!;
        const fileProgressMap = new Map<number, number>();

        const handleMessage = (event: MessageEvent) => {
          const { type } = event.data;

          if (type === 'progress') {
            const { fileIndex, fileName, progress } = event.data;
            fileProgressMap.set(fileIndex, progress);

            // Call individual progress callback
            if (options?.onProgress) {
              options.onProgress(fileIndex, fileName, progress);
            }

            // Calculate overall progress (average of all files)
            if (options?.onOverallProgress) {
              const totalProgress = Array.from(fileProgressMap.values()).reduce(
                (sum, p) => sum + p,
                0
              );
              const overallProgress = totalProgress / files.length;
              options.onOverallProgress(overallProgress);
            }
          } else if (type === 'complete') {
            isProcessingRef.current = false;
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            resolve(event.data.data);
          } else if (type === 'error') {
            isProcessingRef.current = false;
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            reject(new Error(event.data.error));
          }
        };

        const handleError = (error: ErrorEvent) => {
          isProcessingRef.current = false;
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          reject(new Error(error.message));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        worker.postMessage({
          type: 'processFiles',
          files,
        });
      });
    },
    []
  );

  return {
    processFiles,
    get isProcessing() {
      return isProcessingRef.current;
    },
  };
}
