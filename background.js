// Background service worker.
//
// Content scripts run in an "isolated world": they share the page's DOM but
// NOT the page's JavaScript variables or methods that the page itself
// attached to DOM elements. That means a content script calling
// document.querySelector('#movie_player').getPlayerResponse() or reading
// window.ytInitialPlayerResponse will typically get undefined, even though
// that data clearly exists on the page.
//
// The fix: chrome.scripting.executeScript with { world: 'MAIN' } runs a
// function inside the page's REAL JavaScript context, where those things
// are visible. This service worker does that on request from the content
// script, and returns the result via sendResponse.
//
// It also offers a raw-text fetch proxy, since background service workers
// are not subject to the page's Content-Security-Policy, as a fallback if
// a direct fetch from the content script gets blocked or returns nothing.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'GET_PLAYER_RESPONSE') {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) {
      sendResponse({ ok: false, error: 'no sender tab id' });
      return true;
    }
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: () => {
        // Runs inside the actual YouTube page's JS context.
        try {
          const player = document.querySelector('#movie_player');
          if (player && typeof player.getPlayerResponse === 'function') {
            const resp = player.getPlayerResponse();
            if (resp) return { source: 'movie_player.getPlayerResponse()', data: resp };
          }
        } catch (e) {
          // fall through to the next method
        }
        try {
          if (window.ytInitialPlayerResponse) {
            return { source: 'window.ytInitialPlayerResponse', data: window.ytInitialPlayerResponse };
          }
        } catch (e) {
          // fall through
        }
        return { source: 'none', data: null };
      }
    }).then((results) => {
      const result = results && results[0] ? results[0].result : null;
      if (!result) {
        sendResponse({ ok: false, error: 'executeScript returned no result' });
        return;
      }
      sendResponse({ ok: true, source: result.source, playerResponse: result.data });
    }).catch((err) => {
      sendResponse({ ok: false, error: String(err) });
    });
    return true; // keep the message channel open for the async response
  }

  if (message && message.type === 'FETCH_TEXT' && message.url) {
    fetch(message.url)
      .then(async (res) => {
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, text: text });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }
});
