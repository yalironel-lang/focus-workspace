// Finite client-side budgets; no retries and no dependency on server responses.
export const RECOVERY_LIMITS = Object.freeze({
  connectMs: 5000, queryMs: 6000, rollbackMs: 2000, endMs: 2000, overallMs: 45000,
});
const stopped = () => Error('RECOVERY_DEADLINE_EXPIRED');

export class RecoveryDeadlines {
  constructor(connection, overrides = {}) {
    this.connection = connection;
    this.limits = { ...RECOVERY_LIMITS, ...overrides };
    for (const [key, value] of Object.entries(this.limits)) {
      if (!Object.hasOwn(RECOVERY_LIMITS, key) || !Number.isInteger(value)
        || value <= 0 || value > RECOVERY_LIMITS[key]) throw stopped();
    }
    this.expired = false;
    this.pending = new Set();
    this.expiresAt = Date.now() + this.limits.overallMs;
    this.overallTimer = setTimeout(() => this.expire(), this.limits.overallMs);
  }
  requestEnd() {
    if (!this.endRequested) {
      this.endRequested = true;
      try {
        if (typeof this.connection.end !== 'function') throw stopped();
        // Public pg Client.end(): request termination, without inspecting driver internals.
        this.endPromise = Promise.resolve(this.connection.end());
      } catch { this.endPromise = Promise.reject(stopped()); }
      this.endPromise.catch(() => {}); // Never log a driver exception or create an unhandled rejection.
    }
    return this.endPromise;
  }
  expire() {
    if (this.expired) return;
    this.expired = true; // Irreversible: late results cannot restore CLEAR.
    for (const stop of [...this.pending]) stop();
    this.requestEnd();
  }
  run(action, limit) {
    const remaining = this.expiresAt - Date.now();
    if (this.expired || remaining <= 0) { this.expire(); return Promise.reject(stopped()); }
    return new Promise((resolve, reject) => {
      let finished = false, timer;
      const finish = (ok, value) => {
        if (finished) return;
        finished = true; clearTimeout(timer); this.pending.delete(stop);
        if (ok && !this.expired) resolve(value); else reject(ok ? stopped() : value);
      };
      const stop = () => finish(false, stopped());
      this.pending.add(stop);
      timer = setTimeout(() => this.expire(), Math.min(limit, remaining));
      try { Promise.resolve(action()).then(value => finish(true, value), error => finish(false, error)); }
      catch (error) { finish(false, error); }
    });
  }
  close() { clearTimeout(this.overallTimer); }
}
