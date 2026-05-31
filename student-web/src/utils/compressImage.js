function isImageFile(file) {
  if (!file) return false;
  if (file.type?.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '');
}

/** Always re-encode feed photos as JPEG under ~900KB so uploads succeed. */
export async function prepareFeedImageFile(file) {
  if (!isImageFile(file)) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width;
      let h = img.height;
      const maxW = 1200;
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
            if (blob.size > 900 * 1024 && q > 0.45) {
              tryQuality(q - 0.12);
              return;
            }
            resolve(new File([blob], 'feed-photo.jpg', { type: 'image/jpeg' }));
          },
          'image/jpeg',
          q
        );
      };
      tryQuality(0.82);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image. Try JPG or PNG.'));
    };
    img.src = url;
  });
}
