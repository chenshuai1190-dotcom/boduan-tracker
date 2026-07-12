export function normalizeConfirmModalOptions(options = {}) {
  return {
    title: options.title || '确认操作?',
    desc: options.desc || '此操作不可撤销',
    info: options.info || null,
    confirmText: options.confirmText || '删除',
    submittingText: options.submittingText || '处理中...',
    cancelText: options.cancelText || '取消',
    confirmStyle: options.confirmStyle || 'danger',
    icon: options.icon || '🗑',
    showCancel: options.showCancel !== false,
    onConfirm: options.onConfirm,
  };
}
