import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'urlist — shareable link collections',
    short_name: 'urlist',
    description: 'Create curated link collections with rich previews, custom URLs, and drag-to-reorder.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fcff',
    theme_color: '#ff7f50',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    share_target: {
      action: '/api/capture/share-target',
      method: 'POST',
      enctype: 'application/x-www-form-urlencoded',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
      },
    },
  };
}
