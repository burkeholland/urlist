'use client';

interface PublishButtonProps {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}

export function PublishButton({ onClick, disabled, loading }: PublishButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className="btn btn-primary"
      style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      {loading ? (
        'Publishing…'
      ) : (
        'Publish'
      )}
    </button>
  );
}
