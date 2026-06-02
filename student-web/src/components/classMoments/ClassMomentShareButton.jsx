import { useState } from 'react';
import { api } from '../../api';

export default function ClassMomentShareButton({ moment, token }) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy || !token || !moment?.id) return;
    setBusy(true);
    try {
      const data = await api.post(`/class-moments/${moment.id}/share`, { channel: 'social' }, token);
      const url = data.share_url;
      const text = data.preview?.description || data.preview?.title || 'Class moment on UClass';
      const title = data.preview?.title || "Today's Class Moment";

      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
        alert('Link copied — paste on WhatsApp, Facebook, or Instagram.');
      } else {
        window.prompt('Copy this link:', url);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        alert(err.message || 'Could not share.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="cm-soc-action cm-soc-action--share"
      disabled={busy || moment?._pending}
      onClick={share}
    >
      <span className="cm-soc-action__icon" aria-hidden>
        ↗
      </span>
      {busy ? 'Sharing…' : 'Share'}
    </button>
  );
}
