function isImageFile(file) {
  if (!file) return false;
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '');
}

function isHeicLike(file) {
  const mime = (file.type || '').toLowerCase();
  return mime.includes('heic') || mime.includes('heif') || /\.heic$/i.test(file.name || '') || /\.heif$/i.test(file.name || '');
}

function reencodeImage(file, { maxW, maxBytes, outName }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width;
      let h = img.height;
      if (w > maxW) {
        h = Math.round(h * (maxW / w));
        w = maxW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const tryQuality = (q) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            if (blob.size > maxBytes && q > 0.4) {
              tryQuality(q - 0.1);
              return;
            }
            const base = (file.name || outName || 'photo').replace(/\.[^.]+$/, '');
            resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          q
        );
      };
      tryQuality(0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (isImageFile(file)) {
        resolve(file);
        return;
      }
      reject(new Error('Could not read this image. Try JPG or PNG.'));
    };
    img.src = url;
  });
}

/** Classroom feed — smaller files for quick posts */
export async function prepareFeedImageFile(file) {
  if (!isImageFile(file)) return file;
  if (isHeicLike(file)) return file;
  return reencodeImage(file, {
    maxW: 1200,
    maxBytes: 900 * 1024,
    outName: 'feed-photo.jpg',
  });
}

/** Class Moments — balanced quality + fast upload (still sharp in feed) */
export async function prepareMomentImageFile(file, index = 0) {
  if (!isImageFile(file)) return file;
  if (isHeicLike(file)) return file;
  if (file.type === 'image/jpeg' && file.size < 400 * 1024) return file;
  if (file.type === 'image/png' && file.size < 500 * 1024) {
    return file;
  }
  return reencodeImage(file, {
    maxW: 1600,
    maxBytes: 650 * 1024,
    outName: `moment-${index + 1}.jpg`,
  });
}

function isVideoFile(file) {
  if (!file) return false;
  if (file.type?.startsWith('video/')) return true;
  return /\.(mp4|mov|webm|3gp|m4v|mkv)$/i.test(file.name || '');
}

/** Compress images only; pass videos through unchanged */
export async function prepareMomentMediaFiles(files) {
  return Promise.all(
    files.map(async (f, i) => {
      if (isVideoFile(f)) return f;
      try {
        return await prepareMomentImageFile(f, i);
      } catch {
        if (isImageFile(f)) return f;
        throw new Error('Could not prepare this photo. Try JPG or PNG.');
      }
    })
  );
}
