const TICK_MS = 60 * 1000;
let intervalId = null;

export function startGardenScheduler(client, processTick) {
  if (intervalId) {
    clearInterval(intervalId);
  }

  const run = () => {
    processTick(client).catch((err) => {
      console.error('Garden scheduler tick failed:', err);
    });
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
