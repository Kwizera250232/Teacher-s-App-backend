import { isMomentVideo } from './momentImages';

/** Pick first gallery photo (skips videos), sorted by sort_order. */
export function pickFirstMomentPhoto(images) {
  const list = Array.isArray(images) ? [...images] : [];
  list.sort((a, b) => {
    const ao = Number(a?.sort_order) || 0;
    const bo = Number(b?.sort_order) || 0;
    if (ao !== bo) return ao - bo;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });
  for (const img of list) {
    const fp = img?.file_path;
    if (!fp || isMomentVideo(fp)) continue;
    return img;
  }
  return null;
}
