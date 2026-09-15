import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #ff7f50 0%, #0ea5e9 100%)',
          color: '#ffffff',
          fontSize: 256,
          fontWeight: 700,
          borderRadius: 92,
        }}
      >
        u
      </div>
    ),
    size,
  );
}
