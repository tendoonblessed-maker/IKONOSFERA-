/** Track pointers currently holding a story viewer to pause playback. */
export function addStoryPausePointer(pointerIds: Set<number>, pointerId: number): boolean {
  pointerIds.add(pointerId);
  return pointerIds.size > 0;
}

/** Release one pointer; playback resumes only after every active hold is gone. */
export function removeStoryPausePointer(pointerIds: Set<number>, pointerId: number): boolean {
  pointerIds.delete(pointerId);
  return pointerIds.size > 0;
}
