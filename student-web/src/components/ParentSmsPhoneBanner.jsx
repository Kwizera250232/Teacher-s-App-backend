import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Prompt parent to add a Rwanda mobile number for SMS homework alerts.
 */
export default function ParentSmsPhoneBanner({ token }) {
  const [settings, setSettings] = useState(null);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    api.get('/parent/sms/settings', token).then(setSettings).catch(() => {});
  };

  useEffect(() => {
    load();
  }, [token]);

  if (!settings || settings.phone_ready) return null;
  if (!settings.sms_configured) return null;

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await api.put('/parent/sms/settings', { phone, sms_notify: true }, token);
      setMsg('Saved — you will get SMS when teachers post homework or class updates.');
      load();
    } catch (err) {
      setMsg(err.message || 'Could not save phone.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="parent-sms-banner" role="region" aria-label="SMS alerts">
      <p className="parent-sms-banner-title">📱 Get alerts on your phone (SMS)</p>
      <p className="parent-sms-banner-text">
        Add your MTN or Airtel number so we can text you when teachers upload homework or class photos — even if you are offline.
      </p>
      <form className="parent-sms-banner-form" onSubmit={onSave}>
        <input
          type="tel"
          placeholder="078 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save number'}
        </button>
      </form>
      {msg && <p className="parent-sms-banner-msg">{msg}</p>}
    </div>
  );
}
