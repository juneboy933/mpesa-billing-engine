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
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
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
  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordMessage('');
    try {
      await api.setPassword(password, currentPassword || undefined);
      setPassword('');
      setCurrentPassword('');
      setPasswordMessage('Password saved. Use it the next time you sign in.');
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'Unable to update password');
    } finally {
      setSavingPassword(false);
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
      <form className="data-panel form-panel settings-form" onSubmit={updatePassword}>
        <div className="eyebrow">Account security</div>
        <h2>Merchant password</h2>
        <p className="muted">Use at least 12 characters. Existing accounts can set their first password while signed in. Forgotten passwords require support; optional email is not used for resets.</p>
        <label htmlFor="current-password">Current password <span className="muted">(leave blank if setting one for the first time)</span>
          <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
        </label>
        <label htmlFor="new-password">New password
          <input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} />
        </label>
        {passwordMessage && <p className="form-message" role="status">{passwordMessage}</p>}
        <button className="primary-button" disabled={savingPassword || password.length < 12}>{savingPassword ? 'Saving…' : 'Save password'}</button>
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
