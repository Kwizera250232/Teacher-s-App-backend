import { useState } from 'react';
import { api } from '../../api';

async function photoFileForShare(imageUrl) {
  if (!imageUrl || !navigator.share) return null;
  try {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
    return new File([blob], 'class-moment.jpg', { type });
  } catch {
    return null;
  }
}

export default function ClassMomentShareButton({ moment, token }) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy || !token || !moment?.id) return;
    setBusy(true);
    try {
      const data = await api.post(`/class-moments/${moment.id}/share`, { channel: 'social' }, token);
      const url = data.app_url || data.share_url;
      const text = data.preview?.description || data.preview?.title || 'Class moment on UClass';
      const title = data.preview?.title || "Today's Class Moment";
      const token = data.share_token;
      const imageUrl =
        (token && typeof window !== 'undefined'
          ? `${window.location.origin}/share/moment/${encodeURIComponent(token)}/preview.jpg`
          : null) ||
        data.preview?.preview_image_url ||
        data.preview?.image_url;
      const shareText = data.preview?.has_photo
        ? `${text}\n📸 Link preview includes a class photo.`
        : text;

      if (navigator.share) {
        const photoFile = imageUrl ? await photoFileForShare(imageUrl) : null;
        if (photoFile && navigator.canShare?.({ files: [photoFile], url, title, text: shareText })) {
          await navigator.share({ files: [photoFile], url, title, text: shareText });
        } else {
          await navigator.share({ title, text: shareText, url });
        }
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${title}\n${shareText}\n${url}`);
        alert('Link copied — WhatsApp/Facebook will show one class photo in the preview.');
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
