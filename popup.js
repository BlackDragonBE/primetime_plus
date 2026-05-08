const DEFAULT_SETTINGS = {
  daysSuffix: true,
  predictor: true,
  liveDagtotaal: true,
  weekMonthTotals: true,
  colorCoding: true,
  forgottenClockout: true,
  tooltips: true,
};

document.addEventListener('DOMContentLoaded', () => {
  setupStatus();
  setupToggles();
});

function setupStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const status = document.getElementById('status');
    const isPrimeTimeApp = currentTab?.url?.includes('provincieantwerpen.get.be/Primetime/webapp');

    if (isPrimeTimeApp) {
      status.textContent = '✓ Extension Active';
      status.className = 'status';
    } else {
      status.textContent = '⚠ Open Prime Time';
      status.className = 'status warn';
      status.addEventListener('click', () => {
        chrome.tabs.update({ url: 'https://provincieantwerpen.get.be/Primetime/webapp/?locale=nl' });
      });
    }
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
