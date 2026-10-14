// Browser checks are optional. Install Playwright locally, or point
// TETY_PLAYWRIGHT_PATH to a Playwright package already available on this machine.
function getChromium() {
  try {
    return require('playwright').chromium;
  } catch (cause) {
    if (process.env.TETY_PLAYWRIGHT_PATH) {
      return require(process.env.TETY_PLAYWRIGHT_PATH).chromium;
    }
    throw new Error('Browser checks need Playwright: npm install --no-save playwright; npx playwright install chromium. An existing package can be supplied with TETY_PLAYWRIGHT_PATH.', { cause });
  }
}

function launchOptions(args = []) {
  return {
    headless: true,
    ...(process.env.TETY_BROWSER_EXECUTABLE ? { executablePath: process.env.TETY_BROWSER_EXECUTABLE } : {}),
    ...(args.length ? { args } : {})
  };
}

module.exports = { getChromium, launchOptions };
