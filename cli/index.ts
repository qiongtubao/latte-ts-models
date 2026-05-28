#!/usr/bin/env node
import { Command } from 'commander';
import { startServer } from './server';

const program = new Command();

program
  .name('latte-ts-models')
  .description('latte-ts-models CLI - AI model configuration & testing tool')
  .version('1.0.0');

program
  .command('ui')
  .description('Open the configuration management UI')
  .option('-p, --port <port>', 'Server port', '3456')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    startServer(port);

    if (options.open) {
      const { exec } = await import('child_process');
      const url = `http://localhost:${port}`;
      const platform = process.platform;
      if (platform === 'darwin') {
        exec(`open ${url}`);
      } else if (platform === 'win32') {
        exec(`start ${url}`);
      } else {
        exec(`xdg-open ${url}`);
      }
      console.log(`Opening ${url} in browser...`);
    }
  });

program.parse(process.argv);
