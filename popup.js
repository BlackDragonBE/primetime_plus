// DEFAULT_SETTINGS is loaded from settings.js

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;
  setupStatus();
  setupToggles();
  checkForUpdate();
});

function checkForUpdate() {
  fetch('https://api.github.com/repos/BlackDragonBE/primetime_plus/releases/latest')
    .then((r) => r.json())
    .then((release) => {
      const latest = (release.tag_name || '').replace(/^v/, '').split('.').map(Number);
      const current = chrome.runtime.getManifest().version.split('.').map(Number);
      let isNewer = false;
      for (let i = 0; i < Math.max(latest.length, current.length); i++) {
        const l = latest[i] || 0, c = current[i] || 0;
        if (l !== c) { isNewer = l > c; break; }
      }
      if (isNewer) {
        const banner = document.getElementById('update-banner');
        banner.textContent = `⬆ v${latest.join('.')} beschikbaar`;
        banner.href = release.html_url;
        banner.style.display = 'block';
      }
    })
    .catch(() => {});
}

function setupStatus() {
  const status = document.getElementById('status');
  status.addEventListener('click', () => {
    chrome.tabs.update({ url: 'https://provincieantwerpen.get.be/Primetime/webapp/?locale=nl' });
  });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const isPrimeTimeApp = tabs[0]?.url?.includes('provincieantwerpen.get.be/Primetime/webapp');
    status.style.display = isPrimeTimeApp ? 'none' : 'block';
  });
}

function setupToggles() {
  const inputs = Array.from(document.querySelectorAll('input[data-setting]'));
  chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
    inputs.forEach((input) => {
      const key = input.dataset.setting;
      input.checked = items[key] !== false;
      input.addEventListener('change', () => {
        const update = {};
        update[key] = input.checked;
        chrome.storage.local.set(update);
      });
    });
  });
}
