'use client';

interface ConfirmModalProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onClose,
  danger = false,
}: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm p-8 shadow-2xl"
        style={{
          background: 'var(--surface)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: '12px',
          border: '1px solid var(--surface-border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>
          {title}
        </h2>
        {message && (
          <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            {message}
          </p>
        )}

        <div className="flex flex-col gap-3" style={{ marginTop: message ? 0 : '24px' }}>
          <button
            onClick={onConfirm}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
            style={{
              background: danger ? 'var(--danger)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full text-center text-sm"
          style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
