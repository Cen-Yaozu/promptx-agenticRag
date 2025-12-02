module.exports = {
  apps: [
    {
      name: "server",
      script: "./server/index.js",
      cwd: "./server",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
    {
      name: "collector",
      script: "./collector/index.js",
      cwd: "./collector",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};
