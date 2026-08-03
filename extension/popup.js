document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById('open-player').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('player.html') });
});
