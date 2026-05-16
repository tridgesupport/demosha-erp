import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '@/lib/api';
import { Copy, Check } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setResetUrl(null); setNotFound(false);
    setLoading(true);
    try {
      const res = await forgotPassword(email.trim().toLowerCase());
      if (res.reset_url) {
        setResetUrl(res.reset_url);
      } else {
        setNotFound(true);
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!resetUrl) return;
    navigator.clipboard.writeText(resetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-blue-700">Demosha ERP</h1>
          <p className="text-sm text-gray-500 mt-1">Reset your password</p>
        </div>

        {resetUrl ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              Reset link generated. Copy it below and open in your browser.
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={resetUrl}
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-600 bg-gray-50 truncate"
              />
              <button
                onClick={copy}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <a
              href={resetUrl}
              className="block w-full text-center py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
            >
              Go to Reset Page
            </a>
          </div>
        ) : notFound ? (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              No account found for that email address. Please check and try again, or contact your administrator.
            </div>
            <button
              onClick={() => setNotFound(false)}
              className="w-full py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
            >
              Try again
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Your email address</label>
              <input
                type="email"
                required
                autoFocus
                className="input w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Generating link…' : 'Generate Reset Link'}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-gray-400">
          <Link to="/login" className="text-blue-600 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
