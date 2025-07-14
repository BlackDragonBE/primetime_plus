document.addEventListener('DOMContentLoaded', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    const isPrimeTimeApp = currentTab.url.includes('provincieantwerpen.get.be/Primetime/webapp');
    
    const statusElement = document.querySelector('.status');
    
    if (isPrimeTimeApp) {
      statusElement.textContent = '✓ Extension Active';
      statusElement.style.backgroundColor = '#d5f4e6';
      statusElement.style.color = '#27ae60';
    } else {
      statusElement.textContent = '⚠ Navigate to Prime Time app';
      statusElement.style.backgroundColor = '#ffeaa7';
      statusElement.style.color = '#fdcb6e';
      statusElement.style.cursor = 'pointer';
      statusElement.addEventListener('click', function() {
        chrome.tabs.update({url: 'https://provincieantwerpen.get.be/Primetime/webapp/?locale=nl'});
      });
    }
  });
});