import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { scheduleEmails } from '../api/emails';
import { parseLeads } from '../utils/leadParser';

/**
 * Compose New Email page matching Figma design.
 * Includes From dropdown, To chips with upload, subject, delay/hourly limit,
 * rich text toolbar (decorative), and Send Later popup.
 */
export function Compose() {
  const navigate = useNavigate();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sender, setSender] = useState('');
  const [validEmails, setValidEmails] = useState<string[]>([]);
  const [startTime, setStartTime] = useState(() => getDefaultStartTime());
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [hourlyLimit, setHourlyLimit] = useState(0);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showSendLater, setShowSendLater] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseLeads(text);
      setValidEmails(result.validEmails);
    };
    reader.readAsText(file);
  }, []);

  const isFormComplete =
    subject.trim() !== '' &&
    body.trim() !== '' &&
    sender.trim() !== '' &&
    validEmails.length > 0 &&
    startTime !== '';

  const handleSubmit = async () => {
    if (!isFormComplete || loading) return;

    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const result = await scheduleEmails({
        recipients: validEmails,
        subject: subject.trim(),
        body: body.trim(),
        sender: sender.trim(),
        scheduledTime: new Date(startTime).toISOString(),
        delayBetweenEmailsMs: delaySeconds * 1000,
        maxEmailsPerHour: hourlyLimit || 100,
      });

      setSuccessMessage(`Successfully scheduled ${result.totalJobs} email${result.totalJobs !== 1 ? 's' : ''}!`);
      setTimeout(() => {
        navigate('/dashboard/scheduled');
      }, 1500);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to schedule emails. Please try again.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendLaterSelect = (option: string) => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let date: Date;
    switch (option) {
      case 'tomorrow':
        date = tomorrow;
        date.setHours(9, 0, 0, 0);
        break;
      case 'tomorrow-10':
        date = tomorrow;
        date.setHours(10, 0, 0, 0);
        break;
      case 'tomorrow-11':
        date = tomorrow;
        date.setHours(11, 0, 0, 0);
        break;
      case 'tomorrow-15':
        date = tomorrow;
        date.setHours(15, 0, 0, 0);
        break;
      default:
        date = tomorrow;
        date.setHours(9, 0, 0, 0);
    }

    const pad = (n: number) => n.toString().padStart(2, '0');
    setStartTime(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
    setShowSendLater(false);
    handleSubmit();
  };

  const displayedEmails = validEmails.slice(0, 3);
  const overflowCount = validEmails.length > 3 ? validEmails.length - 3 : 0;

  return (
    <div className="flex flex-col h-screen">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard/scheduled')}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-800">Compose New Email</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Attach icon */}
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          {/* Clock icon */}
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {/* Send Later Button */}
          <div className="relative">
            <button
              onClick={() => setShowSendLater(!showSendLater)}
              className="px-4 py-2 border-2 border-green-500 text-green-600 font-medium rounded-full hover:bg-green-50 transition-colors text-sm"
            >
              Send Later
            </button>

            {/* Send Later Popup */}
            {showSendLater && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Send Later</h3>
                <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Pick date & time</span>
                </div>
                <div className="mb-3">
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-2 mb-4">
                  <button
                    onClick={() => handleSendLaterSelect('tomorrow')}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                  >
                    Tomorrow
                  </button>
                  <button
                    onClick={() => handleSendLaterSelect('tomorrow-10')}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                  >
                    Tomorrow, 10:00 AM
                  </button>
                  <button
                    onClick={() => handleSendLaterSelect('tomorrow-11')}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                  >
                    Tomorrow, 11:00 AM
                  </button>
                  <button
                    onClick={() => handleSendLaterSelect('tomorrow-15')}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                  >
                    Tomorrow, 3:00 PM
                  </button>
                </div>
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setShowSendLater(false)}
                    className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="px-4 py-1.5 text-sm border border-green-500 text-green-600 rounded-lg hover:bg-green-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4">
          {/* Feedback messages */}
          {successMessage && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 mb-4">
              <p className="text-sm text-green-700">{successMessage}</p>
            </div>
          )}
          {errorMessage && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          )}

          {/* From */}
          <div className="flex items-center py-3 border-b border-gray-100">
            <label className="text-sm text-gray-500 w-20">From</label>
            <input
              type="email"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400"
            />
          </div>

          {/* To */}
          <div className="flex items-center py-3 border-b border-gray-100">
            <label className="text-sm text-gray-500 w-20">To</label>
            <div className="flex-1 flex items-center gap-2 flex-wrap">
              {displayedEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium"
                >
                  {email}
                  <button
                    onClick={() => setValidEmails((prev) => prev.filter((e) => e !== email))}
                    className="ml-1.5 text-green-500 hover:text-green-700"
                  >
                    ×
                  </button>
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="text-xs text-gray-500 font-medium">+{overflowCount}</span>
              )}
              <input type="file" ref={fileInputRef} accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium ml-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload List
              </button>
            </div>
          </div>

          {/* Subject */}
          <div className="flex items-center py-3 border-b border-gray-100">
            <label className="text-sm text-gray-500 w-20">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400"
            />
          </div>

          {/* Delay + Hourly Limit */}
          <div className="flex items-center py-3 border-b border-gray-100 gap-8">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 whitespace-nowrap">Delay between 2 emails</label>
              <input
                type="number"
                min={0}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-14 px-2 py-1.5 bg-gray-100 rounded-lg text-sm text-center text-gray-700 outline-none"
                placeholder="00"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 whitespace-nowrap">Hourly Limit</label>
              <input
                type="number"
                min={0}
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="w-14 px-2 py-1.5 bg-gray-100 rounded-lg text-sm text-center text-gray-700 outline-none"
                placeholder="00"
              />
            </div>
          </div>

          {/* Rich Text Toolbar (decorative) */}
          <div className="flex items-center gap-1 py-3 border-b border-gray-100 flex-wrap">
            <ToolbarButton icon="↶" />
            <ToolbarButton icon="↷" />
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton icon="A" className="font-serif" />
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton icon="B" className="font-bold" />
            <ToolbarButton icon="I" className="italic" />
            <ToolbarButton icon="U" className="underline" />
            <ToolbarButton icon="S" className="line-through" />
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton icon="≡" />
            <ToolbarButton icon="≡" />
            <ToolbarButton icon="≡" />
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton icon="•" />
            <ToolbarButton icon="1." />
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarButton icon="❝" />
            <ToolbarButton icon="</>" />
          </div>

          {/* Text Area */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type Your Reply..."
            className="w-full mt-4 min-h-[300px] text-sm text-gray-800 placeholder-gray-400 outline-none resize-none leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ icon, className = '' }: { icon: string; className?: string }) {
  return (
    <button
      type="button"
      className={`w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-sm ${className}`}
    >
      {icon}
    </button>
  );
}

/** Returns a datetime-local string set to 1 hour from now. */
function getDefaultStartTime(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
