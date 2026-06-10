const TICK_MS = 60 * 1000;
let intervalId = null;
let tickRunning = false;

export function startGardenScheduler(client, processTick) {
  if (intervalId) {
    clearInterval(intervalId);
  }

  const run = async () => {
    if (tickRunning) {
      console.warn('Garden tick skipped — previous tick still running.');
      return;
    }
    tickRunning = true;
    try {
      await processTick(client);
    } catch (err) {
      console.error('Garden scheduler tick failed:', err);
    } finally {
      tickRunning = false;
    }
  };

  run();
  intervalId = setInterval(run, TICK_MS);
  console.log('Garden scheduler started (1-minute tick).');
}

export function stopGardenScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
