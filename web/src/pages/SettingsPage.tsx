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
  const [rotatedApiKey, setRotatedApiKey] = useState('');
  const [keyMessage, setKeyMessage] = useState('');
  const [rotatingKey, setRotatingKey] = useState(false);
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
  const rotateApiKey = async () => {
    if (!window.confirm('Your current API key will stop working immediately. Continue only if you can update your integrations now.')) return;
    setRotatingKey(true);
    setRotatedApiKey('');
    setKeyMessage('');
    try {
      const result = await api.rotateApiKey();
      setRotatedApiKey(result.apiKey);
      setKeyMessage('New key created. Save it now; it will not be shown again.');
    } catch (error) {
      setKeyMessage(error instanceof Error ? error.message : 'Unable to rotate API key');
    } finally {
      setRotatingKey(false);
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
      <section className="data-panel key-management-panel">
        <div className="eyebrow">Developer access</div>
        <h2>API key</h2>
        <p className="muted">Rotate a legacy key to use indexed authentication. Rotation immediately invalidates the previous key.</p>
        {keyMessage && <p className="form-message" role="status">{keyMessage}</p>}
        {rotatedApiKey && <>
          <label htmlFor="new-api-key">Copy and store your new key securely<input id="new-api-key" value={rotatedApiKey} readOnly onFocus={event => event.currentTarget.select()} /></label>
          <button className="quiet-link" onClick={() => void navigator.clipboard.writeText(rotatedApiKey).then(() => setKeyMessage('API key copied. Store it securely; it will not be shown again.'))}>Copy API key</button>
        </>}
        <button className="quiet-link" onClick={() => void rotateApiKey()} disabled={rotatingKey}>{rotatingKey ? 'Rotating…' : 'Rotate API key'}</button>
      </section>
    </div>
  );
}
