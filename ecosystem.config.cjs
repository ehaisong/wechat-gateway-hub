module.exports = {
  apps: [{
    name:        'wechat-gateway',
    script:      'node',
    args:        '--env-file /srv/wechat-gateway/.env server.mjs',
    cwd:         '/srv/wechat-gateway',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
