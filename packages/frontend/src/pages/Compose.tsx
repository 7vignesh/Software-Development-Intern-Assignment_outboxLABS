import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '../components/FileUpload';
import { RecipientCount } from '../components/RecipientCount';
import { scheduleEmails } from '../api/emails';

/**
 * Email composition page with form for scheduling batch emails.
 * Includes file upload for recipients, scheduling options, and submission.
 */
export function Compose() {
  const navigate = useNavigate();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sender, setSender] = useState('');
  const [validEmails, setValidEmails] = useState<string[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [startTime, setStartTime] = useState(() => getDefaultStartTime());
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleParse = (result: { validEmails: string[]; invalidCount: number }) => {
    setValidEmails(result.validEmails);
    setInvalidCount(result.invalidCount);
  };

  const isFormComplete =
    subject.trim() !== '' &&
    body.trim() !== '' &&
    sender.trim() !== '' &&
    validEmails.length > 0 &&
    startTime !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        maxEmailsPerHour: hourlyLimit,
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

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">Compose New Email</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Sender */}
        <div>
          <label htmlFor="sender" className="block text-sm font-medium text-gray-700 mb-1">
            Sender Email
          </label>
          <input
            id="sender"
            type="email"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Subject */}
        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
            Subject
          </label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject line"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Body */}
        <div>
          <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
            Body
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email content here..."
            rows={5}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Recipients
          </label>
          <FileUpload onParse={handleParse} />
          <div className="mt-2">
            <RecipientCount validCount={validEmails.length} invalidCount={invalidCount} />
          </div>
        </div>

        {/* Scheduling Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
              Start Time
            </label>
            <input
              id="startTime"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="delay" className="block text-sm font-medium text-gray-700 mb-1">
              Delay (seconds)
            </label>
            <input
              id="delay"
              type="number"
              min={0}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="hourlyLimit" className="block text-sm font-medium text-gray-700 mb-1">
              Hourly Limit
            </label>
            <input
              id="hourlyLimit"
              type="number"
              min={1}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Feedback messages */}
        {successMessage && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3">
            <p className="text-sm text-green-700">{successMessage}</p>
          </div>
        )}
        {errorMessage && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!isFormComplete || loading}
          className="w-full bg-blue-600 text-white font-medium py-2.5 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Scheduling...' : 'Schedule Emails'}
        </button>
      </form>
    </div>
  );
}

/** Returns a datetime-local string set to 1 hour from now. */
function getDefaultStartTime(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  // Format for datetime-local: YYYY-MM-DDTHH:MM
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
