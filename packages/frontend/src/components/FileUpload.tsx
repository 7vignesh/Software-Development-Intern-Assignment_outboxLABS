import { useCallback, useRef, useState } from 'react';
import { parseLeads } from '../utils/leadParser';

interface FileUploadProps {
  onParse: (result: { validEmails: string[]; invalidCount: number }) => void;
}

type UploadState = 'idle' | 'dragging' | 'uploaded';

/**
 * Drag-and-drop file upload zone for CSV/TXT recipient files.
 * Parses the file content and passes valid emails back via callback.
 */
export function FileUpload({ onParse }: FileUploadProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const result = parseLeads(text);
        setFileName(file.name);
        setFileSize(file.size);
        setState('uploaded');
        onParse(result);
      };
      reader.readAsText(file);
    },
    [onParse]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setState('idle');

      const file = e.dataTransfer.files[0];
      if (file && isAcceptedFile(file)) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setState('dragging');
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setState('idle');
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleClick = () => {
    inputRef.current?.click();
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const borderClass =
    state === 'dragging'
      ? 'border-blue-500 bg-blue-50'
      : state === 'uploaded'
        ? 'border-green-400 bg-green-50'
        : 'border-gray-300 bg-white';

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${borderClass}`}
        role="button"
        aria-label="Upload recipient file"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleInputChange}
          className="hidden"
        />

        {state === 'uploaded' ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-green-700">{fileName}</p>
            <p className="text-xs text-green-600">{formatSize(fileSize)}</p>
            <p className="text-xs text-gray-500">Click or drop to replace</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-gray-600">
              {state === 'dragging'
                ? 'Drop your file here'
                : 'Drag & drop a .csv or .txt file here, or click to browse'}
            </p>
            <p className="text-xs text-gray-400">Accepted: .csv, .txt</p>
          </div>
        )}
      </div>
    </div>
  );
}

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.csv') || name.endsWith('.txt');
}
