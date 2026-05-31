import { useEffect, useState } from 'react';
import { api } from '../../api';

const EMPTY_FORM = {
  title: '',
  subject: '',
  lesson_kind: 'song',
  media_type: 'audio',
  media_url: '',
  sort_order: 0,
  enabled: true,
};

export default function AdminNurseryMedia({ token }) {
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState({ interval_days: 3, items_per_group: 2 });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/admin/nursery-media', token);
      setItems(Array.isArray(data.items) ? data.items : []);
      if (data.settings) {
        setSettings({
          interval_days: Number(data.settings.interval_days || 3),
          items_per_group: Number(data.settings.items_per_group || 2),
        });
      }
    } catch (e) {
      setError(e.message || 'Failed to load nursery media.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const submitItem = async () => {
    if (!form.title.trim() || !form.media_url.trim()) {
      setError('Title and media URL are required.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        subject: form.subject.trim(),
        media_url: form.media_url.trim(),
        sort_order: Number(form.sort_order) || 0,
      };

      if (editingId) {
        await api.put(`/admin/nursery-media/${editingId}`, payload, token);
        setMessage('Item updated.');
      } else {
        await api.post('/admin/nursery-media', payload, token);
        setMessage('Item added.');
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e.message || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (resetCycle = false) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.put('/admin/nursery-media/settings', {
        interval_days: Number(settings.interval_days),
        items_per_group: Number(settings.items_per_group),
        reset_cycle: resetCycle,
      }, token);
      setMessage(resetCycle ? 'Settings saved and cycle reset.' : 'Settings saved.');
      await load();
    } catch (e) {
      setError(e.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const editItem = (item) => {
    setEditingId(item.id);
    setForm({
      title: item.title || '',
      subject: item.subject || '',
      lesson_kind: item.lesson_kind || 'song',
      media_type: item.media_type || 'audio',
      media_url: item.media_url || '',
      sort_order: Number(item.sort_order || 0),
      enabled: item.enabled !== false,
    });
  };

  const removeItem = async (id) => {
    if (!window.confirm('Delete this nursery media item?')) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.delete(`/admin/nursery-media/${id}`, token);
      setMessage('Item deleted.');
      if (editingId === id) resetForm();
      await load();
    } catch (e) {
      setError(e.message || 'Failed to delete item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="admin-card">
        <h2 className="admin-section-title">Nursery Rotation Settings</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Auto-change every (days)</label>
            <input
              className="admin-input"
              type="number"
              min="1"
              max="30"
              value={settings.interval_days}
              onChange={(e) => setSettings((s) => ({ ...s, interval_days: e.target.value }))}
            />
          </div>
          <div>
            <label>Items shown per group</label>
            <input
              className="admin-input"
              type="number"
              min="1"
              max="10"
              value={settings.items_per_group}
              onChange={(e) => setSettings((s) => ({ ...s, items_per_group: e.target.value }))}
            />
          </div>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveSettings(false)}>Save Settings</button>
          <button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => saveSettings(true)}>Save + Reset Cycle Now</button>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-section-title">Add / Edit Nursery Media</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div>
            <label>Title</label>
            <input className="admin-input" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
          </div>
          <div>
            <label>Subject (optional)</label>
            <input className="admin-input" value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} />
          </div>
          <div>
            <label>Lesson Kind</label>
            <select className="admin-input" value={form.lesson_kind} onChange={(e) => setForm((s) => ({ ...s, lesson_kind: e.target.value }))}>
              <option value="song">Song</option>
              <option value="subject">Recorded Subject</option>
            </select>
          </div>
          <div>
            <label>Media Type</label>
            <select className="admin-input" value={form.media_type} onChange={(e) => setForm((s) => ({ ...s, media_type: e.target.value }))}>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
            </select>
          </div>
          <div>
            <label>Sort Order</label>
            <input
              className="admin-input"
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((s) => ({ ...s, sort_order: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="nursery-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
            />
            <label htmlFor="nursery-enabled">Enabled</label>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label>Media URL</label>
          <input className="admin-input" value={form.media_url} onChange={(e) => setForm((s) => ({ ...s, media_url: e.target.value }))} />
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={submitItem}>{editingId ? 'Update Item' : 'Add Item'}</button>
          {editingId && <button className="btn btn-outline btn-sm" onClick={resetForm}>Cancel Edit</button>}
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
        {message && <div className="alert alert-success" style={{ marginTop: 10 }}>{message}</div>}
      </div>

      <div className="admin-card">
        <h2 className="admin-section-title">Nursery Media List</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Kind</th>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={7}>No nursery media yet.</td></tr>
                )}
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.lesson_kind}</td>
                    <td>{item.media_type}</td>
                    <td>{item.subject || '-'}</td>
                    <td>{item.sort_order}</td>
                    <td>{item.enabled ? 'Enabled' : 'Disabled'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => editItem(item)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => removeItem(item.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
