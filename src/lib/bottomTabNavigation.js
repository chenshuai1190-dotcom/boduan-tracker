export const HOME_TAB_DOUBLE_TAP_MS = 350;

export function resolveBottomTabTap({
  tabId,
  activeTab,
  activePage,
  lastHomeTapAt = 0,
  now = Date.now(),
  thresholdMs = HOME_TAB_DOUBLE_TAP_MS,
}) {
  const isActiveHomeRoot = tabId === 'home' && activeTab === 'home' && activePage === null;
  if (!isActiveHomeRoot) {
    return {
      nextHomeTapAt: 0,
      shouldScrollHomeToTop: false,
    };
  }

  const elapsedMs = now - lastHomeTapAt;
  const isDoubleTap = lastHomeTapAt > 0 && elapsedMs >= 0 && elapsedMs <= thresholdMs;

  return {
    nextHomeTapAt: isDoubleTap ? 0 : now,
    shouldScrollHomeToTop: isDoubleTap,
  };
}
