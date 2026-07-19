import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_TAB_DOUBLE_TAP_MS,
  resolveBottomTabTap,
  resolveNavigationScrollTarget,
} from '../src/lib/bottomTabNavigation.js';

test('navigation scroll restores a pending Home position only on the Home root', () => {
  assert.deepEqual(resolveNavigationScrollTarget({
    activeTab: 'home',
    activePage: null,
    pendingHomeScrollTop: 486.5,
  }), {
    top: 486.5,
    shouldRestoreHomeScroll: true,
  });

  assert.deepEqual(resolveNavigationScrollTarget({
    activeTab: 'home',
    activePage: null,
    pendingHomeScrollTop: 0,
  }), {
    top: 0,
    shouldRestoreHomeScroll: true,
  });

  for (const navigation of [
    { activeTab: 'home', activePage: 'watchlist-stock-detail' },
    { activeTab: 'trades', activePage: null },
  ]) {
    assert.deepEqual(resolveNavigationScrollTarget({
      ...navigation,
      pendingHomeScrollTop: 486.5,
    }), {
      top: 0,
      shouldRestoreHomeScroll: false,
    });
  }
});

test('active Home double tap scrolls only on the second tap inside the time window', () => {
  const firstTap = resolveBottomTabTap({
    tabId: 'home',
    activeTab: 'home',
    activePage: null,
    now: 1_000,
  });

  assert.deepEqual(firstTap, {
    nextHomeTapAt: 1_000,
    shouldScrollHomeToTop: false,
  });

  const secondTap = resolveBottomTabTap({
    tabId: 'home',
    activeTab: 'home',
    activePage: null,
    lastHomeTapAt: firstTap.nextHomeTapAt,
    now: 1_000 + HOME_TAB_DOUBLE_TAP_MS,
  });

  assert.deepEqual(secondTap, {
    nextHomeTapAt: 0,
    shouldScrollHomeToTop: true,
  });
});

test('expired Home tap starts a new pair instead of scrolling', () => {
  assert.deepEqual(resolveBottomTabTap({
    tabId: 'home',
    activeTab: 'home',
    activePage: null,
    lastHomeTapAt: 1_000,
    now: 1_000 + HOME_TAB_DOUBLE_TAP_MS + 1,
  }), {
    nextHomeTapAt: 1_000 + HOME_TAB_DOUBLE_TAP_MS + 1,
    shouldScrollHomeToTop: false,
  });
});

test('navigation into Home and non-root Home pages never arm the scroll gesture', () => {
  assert.deepEqual(resolveBottomTabTap({
    tabId: 'home',
    activeTab: 'settings',
    activePage: null,
    lastHomeTapAt: 1_000,
    now: 1_100,
  }), {
    nextHomeTapAt: 0,
    shouldScrollHomeToTop: false,
  });

  assert.deepEqual(resolveBottomTabTap({
    tabId: 'home',
    activeTab: 'home',
    activePage: 'stock-detail',
    lastHomeTapAt: 1_000,
    now: 1_100,
  }), {
    nextHomeTapAt: 0,
    shouldScrollHomeToTop: false,
  });
});

test('clicking another bottom tab clears a pending Home tap', () => {
  assert.deepEqual(resolveBottomTabTap({
    tabId: 'trades',
    activeTab: 'home',
    activePage: null,
    lastHomeTapAt: 1_000,
    now: 1_100,
  }), {
    nextHomeTapAt: 0,
    shouldScrollHomeToTop: false,
  });
});
