import { useState } from 'react';
import DeanAiModal from './DeanAiModal';
import UmunsiAiModal from './UmunsiAiModal';
import './DeanSupportFab.css';

/**
 * Dean (Our AI Support) — floating help for students, parents, teachers, HT.
 */
export default function DeanSupportFab({
  token,
  open: controlledOpen,
  onOpenChange,
  classId = null,
  className = '',
  isTeacher = false,
  showClassAi = false,
  hideFab = false,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [classAiOpen, setClassAiOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  if (hideFab && !open && !classAiOpen) return null;

  return (
    <>
      {!hideFab && (
        <div className="dean-fab-wrap dean-fab-wrap--global" aria-live="polite">
          {!open && !classAiOpen && (
            <span className="dean-fab-label">Dean · Our AI Support</span>
          )}
          <button
            type="button"
            className="dean-fab-btn"
            aria-label={open ? 'Close Dean' : 'Open Dean (Our AI Support)'}
            onClick={() => setOpen(!open)}
          >
            {open ? '✕' : '🎓'}
          </button>
        </div>
      )}
      {open && <DeanAiModal token={token} onClose={() => setOpen(false)} />}
      {showClassAi && classId && classAiOpen && (
        <UmunsiAiModal
          classId={classId}
          className={className}
          token={token}
          isTeacher={isTeacher}
          onClose={() => setClassAiOpen(false)}
        />
      )}
      {showClassAi && classId && !open && !hideFab && (
        <button
          type="button"
          className="dean-class-ai-chip"
          onClick={() => setClassAiOpen(true)}
        >
          📚 Class help · Dean
        </button>
      )}
    </>
  );
}
