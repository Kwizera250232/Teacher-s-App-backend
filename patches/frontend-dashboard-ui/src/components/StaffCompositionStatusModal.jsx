import CompositionStatusList from './CompositionStatusList';
import { MODAL_CARD_STYLE, MODAL_OVERLAY_STYLE } from '../utils/modalOverlay';

/** C. Status viewer — opened from the staff mobile toolbar only. */
export default function StaffCompositionStatusModal({ token, schoolWide = true, onClose }) {
  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        style={{ ...MODAL_CARD_STYLE, maxWidth: 480, maxHeight: '85vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: 12, fontSize: 18, color: '#1a1a2e' }}>✍️ C. Status</h2>
        <CompositionStatusList token={token} schoolWide={schoolWide} />
        <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
