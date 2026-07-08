// ─── Server-side Avatar Utility ───────────────────────────────────────
// Generates gender-appropriate default avatars using DiceBear API

/**
 * Generate a default avatar URL based on seed and gender.
 * - Males: uses 'avataaars' style (cartoon character, typically masculine)
 * - Females: uses 'adventurer' style (cartoon character, typically feminine)
 * - Unknown gender: uses 'avataaars' style
 */
export function getDefaultAvatar(seed: string, gender?: string): string {
  const encodedSeed = encodeURIComponent(seed || 'default');
  if (gender === 'female') {
    return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodedSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  }
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodedSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}
