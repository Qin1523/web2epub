export function createLogger({ debug = false } = {}) {
  const entries = [];

  function log(level, message) {
    const line = {
      time: new Date().toISOString(),
      level,
      message,
    };
    entries.push(line);

    if (!debug && level === "debug") {
      return;
    }

    const sink = level === "error" ? console.error : console.log;
    sink(`[${level}] ${message}`);
  }

  return {
    entries,
    debug(message) {
      log("debug", message);
    },
    info(message) {
      log("info", message);
    },
    warn(message) {
      log("warn", message);
    },
    error(message) {
      log("error", message);
    },
  };
}
