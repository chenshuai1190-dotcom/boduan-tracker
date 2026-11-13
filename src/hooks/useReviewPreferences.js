import { useEffect, useMemo, useState } from 'react';
import { createReviewPreferencesController } from '../lib/reviewPreferencesController.js';

export default function useReviewPreferences({ db, userId, preview = false, previewPreferences } = {}) {
  // Preview preferences are a seed; regular rerenders must not reset selections.
  const previewSeed = JSON.stringify(previewPreferences || null);
  const controller = useMemo(() => createReviewPreferencesController({ db, userId, preview,
    previewPreferences: previewSeed ? JSON.parse(previewSeed) : undefined }), [db, userId, preview, previewSeed]);
  const [current, setCurrent] = useState(() => ({ controller, value: controller.getSnapshot() }));
  useEffect(() => {
    controller.activate();
    const unsubscribe = controller.subscribe(value => setCurrent({ controller, value }));
    const unsubscribeExternal = !preview ? db?.subscribeReviewPreferences?.(userId, controller.receive) : null;
    controller.load();
    return () => { unsubscribe(); unsubscribeExternal?.(); controller.dispose(); };
  }, [controller, db, userId, preview]);
  const value = current.controller === controller ? current.value : controller.getSnapshot();
  return { ...value, updatePreferences: controller.updatePreferences, retry: controller.retry, reload: controller.load };
}
