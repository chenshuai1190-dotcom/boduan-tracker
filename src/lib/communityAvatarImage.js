import { COMMUNITY_AVATAR_PIXELS, communityAvatarCropRect, validateCommunityAvatarFile } from './communityAvatarModel.js';
export async function loadCommunityAvatarImage(file) {
  validateCommunityAvatarFile(file, { source: true });
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.decoding = 'async';
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('无法读取这张图片，请换一张 JPG、PNG 或 WebP。')); image.src = url; });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 100000000) throw new Error('图片尺寸过大，请选择较小的图片。');
    return { image, dispose: () => URL.revokeObjectURL(url) };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
export function drawCommunityAvatar(canvas, image, options = {}) {
  const crop = communityAvatarCropRect({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height, ...options });
  const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器暂不支持处理头像。');
  context.clearRect(0, 0, canvas.width, canvas.height); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return crop;
}
export async function encodeCommunityAvatar(image, options, createCanvas = () => document.createElement('canvas')) {
  const canvas = createCanvas(); canvas.width = COMMUNITY_AVATAR_PIXELS; canvas.height = COMMUNITY_AVATAR_PIXELS;
  drawCommunityAvatar(canvas, image, options);
  const encode = (type, quality) => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('头像生成失败，请重试。')), type, quality));
  let blob = await encode('image/webp', .86);
  if (!['image/webp', 'image/jpeg'].includes(blob.type) || blob.size > 2 * 1024 * 1024) blob = await encode('image/jpeg', .82);
  validateCommunityAvatarFile(blob); return blob;
}
