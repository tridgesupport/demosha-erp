import { useState, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { forceChangePassword } from '@/lib/api';
import { KeyRound } from 'lucide-react';

export default function ChangePassword() {
  const { refreshUser, logout } = useAuth();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await forceChangePassword(pw);
      await refreshUser();
    } catch (err: any) {
      setError(err.message ?? 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3">
            <KeyRound className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Set your password</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your account requires a new password before you can continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">New Password</label>
            <input
              type="password"
              required
              autoFocus
              minLength={6}
              className="input w-full"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Confirm Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="input w-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>

        <p className="mt-4 text-center">
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-600"
          >
            Sign out instead
          </button>
        </p>
      </div>
    </div>
  );
}
