class PrimeTimePlus {
  constructor() {
    this.WORKING_DAY_HOURS = 7;
    this.WORKING_DAY_MINUTES = 36;
    this.WORKING_DAY_TOTAL_MINUTES = this.WORKING_DAY_HOURS * 60 + this.WORKING_DAY_MINUTES;
    this.processedElements = new Set();
    
    this.init();
  }

  init() {
    this.enhanceTimeElements();
    this.observeChanges();
  }

  enhanceTimeElements() {
    const timeElements = document.querySelectorAll('.gwt-HTML.primion-label.gwt-Label.GKPVO15PNB-eu-primion-xtremis-client-home-Css-clickableLink');
    
    timeElements.forEach(element => {
      if (!this.processedElements.has(element)) {
        this.processTimeElement(element);
        this.processedElements.add(element);
      }
    });
  }

  processTimeElement(element) {
    const timeText = element.textContent.trim();
    
    if (this.isValidTimeFormat(timeText)) {
      const workingDays = this.calculateWorkingDays(timeText);
      if (workingDays !== null) {
        this.updateElementText(element, timeText, workingDays);
      }
    }
  }

  isValidTimeFormat(text) {
    return /^\d+:\d{2}$/.test(text);
  }

  calculateWorkingDays(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      return null;
    }

    const totalMinutes = hours * 60 + minutes;
    const workingDays = totalMinutes / this.WORKING_DAY_TOTAL_MINUTES;
    
    return Math.round(workingDays * 100) / 100;
  }

  updateElementText(element, originalTime, workingDays) {
    const enhancedText = `${originalTime} (${workingDays}d)`;
    element.textContent = enhancedText;
    element.setAttribute('data-primetime-plus-enhanced', 'true');
  }

  observeChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldProcess = true;
        }
      });
      
      if (shouldProcess) {
        setTimeout(() => this.enhanceTimeElements(), 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PrimeTimePlus());
} else {
  new PrimeTimePlus();
}