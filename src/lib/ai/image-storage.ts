import { promises as fs } from 'fs';
import path from 'path';

const DEFAULT_STORAGE_DIR = path.join(process.cwd(), 'storage', 'ai-images');

export function getAIImageStorageRoot() {
  return path.resolve(process.env.AI_IMAGE_STORAGE_DIR || DEFAULT_STORAGE_DIR);
}

function cleanSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'item';
}

export function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'webp';
}

export async function writeAIImageFile(params: {
  userId: string;
  generationId: string;
  kind: 'source' | 'final';
  extension: string;
  buffer: Buffer;
}) {
  const userDir = cleanSegment(params.userId);
  const fileName = `${cleanSegment(params.generationId)}-${params.kind}.${cleanSegment(params.extension)}`;
  const relativePath = path.join(userDir, fileName);
  const absolutePath = path.join(getAIImageStorageRoot(), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, params.buffer);
  return relativePath;
}

export function resolveAIImagePath(relativePath: string) {
  const root = getAIImageStorageRoot();
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`) && absolutePath !== root) {
    throw new Error('非法图片路径');
  }
  return absolutePath;
}

export async function readAIImageFile(relativePath: string) {
  return fs.readFile(resolveAIImagePath(relativePath));
}
