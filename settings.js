/* Shared settings defaults — loaded by both content.js and popup.js. */

const DEFAULT_SETTINGS = {
  daysSuffix: true,
  predictor: true,
  liveDagtotaal: true,
  weekMonthTotals: true,
  thuiswerkRatio: true,
  colorCoding: true,
  forgottenClockout: true,
  tooltips: true,
  workingDayMinutes: 8 * 60 + 6,
  leaveDayMinutes: 7 * 60 + 36,
  halfTimeMon: false,
  halfTimeTue: false,
  halfTimeWed: false,
  halfTimeThu: false,
  halfTimeFri: false,
};

// ponytail: named constants so magic numbers are searchable
const JOURNAL_HEIGHT_PX = 720;    // GWT scroll table forced height
const LUNCH_BREAK_MIN = 30;        // minimum break subtracted from predictor
const TELEWORK_CEILING_PCT = 50;   // above this % of home work → red pill
