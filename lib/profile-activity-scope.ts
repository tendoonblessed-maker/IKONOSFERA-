export type ProfileActivitySnapshot<T> = {
  ownerId: string;
  targetId: string;
  value: T | null;
};

/** Never render an activity response for a different account or profile. */
export function scopedProfileActivity<T>(
  snapshot: ProfileActivitySnapshot<T> | null,
  ownerId: string,
  targetId: string
): T | null {
  if (!snapshot || !ownerId || !targetId) return null;
  if (snapshot.ownerId !== ownerId || snapshot.targetId !== targetId) return null;
  return snapshot.value;
}
