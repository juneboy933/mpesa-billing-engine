import { useState } from 'react';
import { api } from '../api';
import { PageHeader } from '../components/PageHeader';

export function SettingsPage() {
  const [credentials, setCredentials] = useState({
    consumerKey: '',
    consumerSecret: '',
    shortcode: '',
    passkey: '',
  });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.setupMpesa(credentials);
      setMessage('PayBill credentials validated and saved securely.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to save PayBill setup',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Settings"
        title="Payment setup"
        copy="Manage the PayBill connection used to collect membership payments."
      />
      <form className="data-panel form-panel settings-form" onSubmit={submit}>
        <div className="setup-callout">
          <strong>Credentials stay encrypted</strong>
          <span>
            NiaFlow validates your Daraja access before saving it.
          </span>
        </div>
        {(
          ['shortcode', 'consumerKey', 'consumerSecret', 'passkey'] as const
        ).map((field) => (
          <label key={field} htmlFor={`settings-${field}`}>
            {field === 'shortcode'
              ? 'PayBill number'
              : field === 'consumerKey'
                ? 'Consumer key'
                : field === 'consumerSecret'
                  ? 'Consumer secret'
                  : 'Passkey'}
            <input
              id={`settings-${field}`}
              type={
                field === 'consumerSecret' || field === 'passkey'
                  ? 'password'
                  : 'text'
              }
              value={credentials[field]}
              onChange={(event) =>
                setCredentials({ ...credentials, [field]: event.target.value })
              }
              placeholder={
                field === 'shortcode' ? 'e.g. 411234' : 'From Daraja'
              }
              required
            />
          </label>
        ))}
        {message && <p className="form-message">{message}</p>}
        <button className="primary-button" disabled={saving}>
          {saving ? 'Validating...' : 'Save payment setup'}
        </button>
      </form>
    </div>
  );
}
