/** Shared inline styles so modals sit above staff/parent nav bars. */
export const MODAL_OVERLAY_STYLE = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 5000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

export const MODAL_CARD_STYLE = {
  background: '#fff',
  borderRadius: 16,
  padding: 24,
  width: '100%',
  maxWidth: 480,
  maxHeight: '90vh',
  overflow: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
