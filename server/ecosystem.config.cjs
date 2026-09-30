/**
 * Wangari API — production PM2 configuration.
 *
 * Cluster mode: one Node process per CPU core behind a shared port.
 *  - ~2x throughput on a 2 vCPU box, saturating both cores
 *  - Zero-downtime restarts (`pm2 reload wangari-api`): workers are recycled
 *    one at a time, the port is never left unanswered
 *  - Crash isolation: a worker that dies is respawned instantly while the
 *    others keep serving
 *
 * Runs the COMPILED build (dist/index.js), not tsx — tsx is a dev runner;
 * it costs startup time and memory and blocks cluster mode.
 *
 * Deploy:   npm run build && pm2 reload ecosystem.config.cjs --update-env
 * One-time: pm2 startup && pm2 save   (boot persistence)
 */
module.exports = {
  apps: [
    {
      name: "wangari-api",
      script: "dist/index.js",
      exec_mode: "cluster",
      instances: "max", // one per core (2 on this VPS)
      env: {
        NODE_ENV: "production",
      },
      // Memory guard: a worker that climbs past 400MB is recycled instead of
      // being allowed to eat the 1GB box. All traffic keeps flowing via the
      // sibling worker during the recycle.
      max_memory_restart: "400M",
      // Graceful: wait for in-flight requests to finish before a worker dies.
      kill_timeout: 10000,
      listen_timeout: 8000,
      wait_ready: false,
      // Never let restart storms thrash the box.
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,
      // Timestamped logs, out/err split. Pair with `pm2 install
      // pm2-logrotate` so they can never fill the disk.
      out_file: "/home/lewis/.pm2/logs/wangari-api-out.log",
      error_file: "/home/lewis/.pm2/logs/wangari-api-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
