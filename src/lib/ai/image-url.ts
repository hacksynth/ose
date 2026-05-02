export function imageUrlFor(generation: { id: string; updatedAt: Date }) {
  return `/api/ai/wrong-note-image/${generation.id}/file?v=${generation.updatedAt.getTime()}`;
}
