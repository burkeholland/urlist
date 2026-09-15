import { describe, expect, it } from 'vitest';
import { getContrastTextColor } from '@/lib/list-branding';

describe('list branding contrast', () => {
  it('chooses the higher-contrast text color for each curated accent', () => {
    expect(getContrastTextColor('#ff7f50')).toBe('#111827');
    expect(getContrastTextColor('#d97706')).toBe('#111827');
    expect(getContrastTextColor('#0f766e')).toBe('#ffffff');
    expect(getContrastTextColor('#7c3aed')).toBe('#ffffff');
  });
});
