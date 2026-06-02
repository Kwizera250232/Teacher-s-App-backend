function isImageFile(file) {
  if (!file) return false;
  if (file.type?.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '');
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
              reject(new Error('Could not process image. Try another photo.'));
              return;
            }
            if (blob.size > maxBytes && q > 0.4) {
              tryQuality(q - 0.1);
              return;
            }
            resolve(new File([blob], outName, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          q
        );
      };
      tryQuality(0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image. Try JPG or PNG.'));
    };
    img.src = url;
  });
}

/** Classroom feed — smaller files for quick posts */
export async function prepareFeedImageFile(file) {
  if (!isImageFile(file)) return file;
  return reencodeImage(file, {
    maxW: 1200,
    maxBytes: 900 * 1024,
    outName: 'feed-photo.jpg',
  });
}

/** Class Moments — balanced quality + fast upload (still sharp in feed) */
export async function prepareMomentImageFile(file, index = 0) {
  if (!isImageFile(file)) return file;
  if (file.type === 'image/jpeg' && file.size < 400 * 1024) return file;
  return reencodeImage(file, {
    maxW: 1600,
    maxBytes: 650 * 1024,
    outName: `moment-${index + 1}.jpg`,
  });
}

export async function prepareMomentImageFiles(files) {
  return Promise.all(files.map((f, i) => prepareMomentImageFile(f, i)));
}
