module.exports = {
  apps: [{
    name: 'areej-pro',
    script: './server/app.js',
    cwd: '/home/work/.openclaw/workspace/areej-pro',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    restart_delay: 3000,
    max_restarts: 20,
    min_uptime: '10s',
    env: {
      NODE_ENV: 'production',
      PORT: '3002',
      NODE_PATH: '/home/work/.openclaw/workspace/areej-pro/server',
      // حل مشكلة puppeteer chrome — المكتبات موجودة لكن linker لا يجدها
      LD_LIBRARY_PATH: '/usr/lib/x86_64-linux-gnu:/usr/lib:/lib/x86_64-linux-gnu'
    },
    error_file: '/home/work/.pm2/logs/areej-pro-error.log',
    out_file: '/home/work/.pm2/logs/areej-pro-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
