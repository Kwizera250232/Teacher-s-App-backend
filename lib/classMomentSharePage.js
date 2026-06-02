const pool = require('../db');
const { ensureClassMomentSharesSchema, sharePreviewFromMoment } = require('./classMomentShares');
const {
  apiPublicBase,
  frontendBase,
  pickOgImageUrl,
  isImageMediaUrl,
} = require('./classMomentMediaUrl');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadSharedMoment(shareToken) {
  await ensureClassMomentSharesSchema();
  const row = await pool.query(
    `SELECT s.share_token, s.created_at AS shared_at, sh.name AS sharer_name,
            m.*, u.name AS teacher_name, c.name AS class_name,
            COALESCE(
              (SELECT json_agg(json_build_object(
                'id', i.id, 'file_path', i.file_path, 'sort_order', i.sort_order
              ) ORDER BY i.sort_order, i.id)
               FROM class_moment_images i WHERE i.moment_id = m.id),
              '[]'::json
            ) AS images
     FROM class_moment_shares s
     JOIN class_moments m ON m.id = s.moment_id
     JOIN users u ON u.id = m.teacher_id
     JOIN classes c ON c.id = m.class_id
     JOIN users sh ON sh.id = s.sharer_id
     WHERE s.share_token = $1
     LIMIT 1`,
    [shareToken]
  );
  return row.rows[0] || null;
}

function renderShareMomentHtml(moment, shareToken) {
  const apiBase = apiPublicBase();
  const preview = sharePreviewFromMoment(moment, apiBase);
  const ogImage = pickOgImageUrl(moment, apiBase);
  const title = preview.title || "Today's Class Moment — UClass";
  const description =
    preview.description ||
    `Class moment from ${moment.class_name || 'class'} on UClass.`;
  const canonical = `${apiBase}/share/moment/${encodeURIComponent(shareToken)}`;
  const appUrl = `${frontendBase()}/share/moment/${encodeURIComponent(shareToken)}`;
  const displayImage = pickOgImageUrl(moment, apiBase);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="UClass" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(ogImage)}" />
  <meta property="og:image:alt" content="${escapeHtml(title)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <meta itemprop="name" content="${escapeHtml(title)}" />
  <meta itemprop="description" content="${escapeHtml(description)}" />
  <meta itemprop="image" content="${escapeHtml(ogImage)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; }
    img.preview { width: 100%; max-height: 70vh; object-fit: contain; border-radius: 12px; }
    a { color: #128c7e; }
  </style>
</head>
<body>
  <p><strong>${escapeHtml(title)}</strong></p>
  ${displayImage && isImageMediaUrl(displayImage) ? `<p><img class="preview" src="${escapeHtml(displayImage)}" alt="" /></p>` : ''}
  <p>${escapeHtml(description)}</p>
  <p><a href="${escapeHtml(appUrl)}">Open in UClass →</a></p>
</body>
</html>`;
}

module.exports = {
  loadSharedMoment,
  renderShareMomentHtml,
  apiPublicBase,
  frontendBase,
};
