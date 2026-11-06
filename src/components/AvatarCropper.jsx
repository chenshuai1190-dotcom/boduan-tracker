import React from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { communityAvatarCropRect } from '../lib/communityAvatarModel.js';
import { loadCommunityAvatarImage, drawCommunityAvatar, encodeCommunityAvatar } from '../lib/communityAvatarImage.js';
import './AvatarCropper.css';
export default function AvatarCropper({ file, onConfirm, onClose, language = 'zh' }) {
  const en = language.startsWith('en'), [image, setImage] = React.useState(null), [crop, setCrop] = React.useState({ zoom: 1, x: .5, y: .5 }), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false);
  const canvasRef = React.useRef(null), dialogRef = React.useRef(null), gesture = React.useRef(null), busyRef = React.useRef(false), closeRef = React.useRef(onClose), alive = React.useRef(true);
  closeRef.current = onClose;
  React.useEffect(() => { let active = true, dispose; loadCommunityAvatarImage(file).then(result => { if (!active) { result.dispose(); return; } dispose = result.dispose; setImage(result.image); }).catch(cause => { if (active) setError(cause.message); }); return () => { active = false; dispose?.(); }; }, [file]);
  React.useEffect(() => {
    alive.current = true; const dialog = dialogRef.current, trigger = document.activeElement, overflow = document.body.style.overflow, owns = overflow !== 'hidden'; if (owns) document.body.style.overflow = 'hidden';
    dialog.showModal(); dialog.focus({ preventScroll: true }); const cancel = event => { event.preventDefault(); if (!busyRef.current) closeRef.current(); }; dialog.addEventListener('cancel', cancel);
    return () => { alive.current = false; dialog.removeEventListener('cancel', cancel); dialog.close(); if (owns) document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  React.useEffect(() => { if (image && canvasRef.current) drawCommunityAvatar(canvasRef.current, image, crop); }, [image, crop]);
  const clear = event => { gesture.current = null; if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  const confirm = async () => { if (!image || busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); try { const blob = await encodeCommunityAvatar(image, crop); if (alive.current) onConfirm(blob); } catch (cause) { if (alive.current) setError(cause.message); } finally { busyRef.current = false; if (alive.current) setBusy(false); } };
  return createPortal(<dialog ref={dialogRef} tabIndex={-1} className="avatar-crop-dialog" aria-label={en ? 'Crop avatar' : '调整头像'}><header><button type="button" disabled={busy} onClick={onClose} aria-label={en ? 'Cancel' : '取消'}><X size={21}/></button><h2>{en ? 'Crop avatar' : '调整头像'}</h2><button type="button" disabled={!image || busy} onClick={confirm}>{busy ? <Loader2 size={18} className="avatar-crop-spin"/> : en ? 'Use' : '使用'}</button></header><div className="avatar-crop-body"><div className="avatar-crop-stage" onPointerDown={event => {
    if (!image || busy || event.button > 0) return; gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop }; event.currentTarget.setPointerCapture?.(event.pointerId);
  }} onPointerMove={event => {
    const current = gesture.current; if (!current || current.id !== event.pointerId) return; const bounds = event.currentTarget.getBoundingClientRect(), rect = communityAvatarCropRect({ width: image.naturalWidth, height: image.naturalHeight, ...current.crop });
    const x = Math.max(rect.width / 2 / image.naturalWidth, Math.min(1 - rect.width / 2 / image.naturalWidth, current.crop.x - (event.clientX - current.x) * rect.width / bounds.width / image.naturalWidth));
    const y = Math.max(rect.height / 2 / image.naturalHeight, Math.min(1 - rect.height / 2 / image.naturalHeight, current.crop.y - (event.clientY - current.y) * rect.height / bounds.height / image.naturalHeight)); setCrop({ ...current.crop, x, y });
  }} onPointerUp={clear} onPointerCancel={clear} onLostPointerCapture={() => { gesture.current = null; }}><canvas ref={canvasRef} width="512" height="512"/><span className="avatar-crop-guide"/>{!image && !error && <Loader2 className="avatar-crop-loading avatar-crop-spin" size={25}/>}</div><p>{en ? 'Drag to reposition; use the slider to zoom.' : '拖动调整位置，滑动下方缩放'}</p><input type="range" min="1" max="4" step=".01" value={crop.zoom} disabled={!image || busy} aria-label={en ? 'Avatar zoom' : '头像缩放'} onChange={event => setCrop(current => ({ ...current, zoom: Number(event.target.value) }))}/><span className="avatar-crop-meta">{en ? 'Square image · compressed on your device' : '正方形头像 · 在当前设备裁剪压缩'}</span>{error && <p className="avatar-crop-error" role="alert">{error}</p>}</div></dialog>, document.body);
}
