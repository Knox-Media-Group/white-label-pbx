/**
 * PM2 Ecosystem Configuration
 * Run: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "white-label-pbx",
      script: "dist/index.js",
      cwd: "/home/user/white-label-pbx",
      instances: 1,
      exec_mode: "fork",
      node_args: "--max-old-space-size=512",

      // Environment
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // Auto restart
      watch: false,
      max_memory_restart: "500M",
      restart_delay: 5000,
      max_restarts: 10,

      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/pbx/error.log",
      out_file: "/var/log/pbx/out.log",
      merge_logs: true,
      log_type: "json",

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 10000,

      // Health check
      min_uptime: 10000,
    },
  ],
};
