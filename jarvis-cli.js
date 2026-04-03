#!/usr/bin/env node

const readline = require('readline');
const https = require('https');
const http = require('http');

// Configuration
const ORCHESTRATOR_URL = 'http://localhost:3001';
const USER_NAME = 'Danny';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

// Clear screen
const clear = () => process.stdout.write('\x1b[2J\x1b[H');

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Type text with effect
async function typeText(text, speed = 30) {
  for (const char of text) {
    process.stdout.write(char);
    await delay(speed);
  }
}

// Print JARVIS boot sequence
async function bootSequence() {
  clear();

  // Arc reactor animation frames
  const frames = [
    `
                    ${colors.dim}◯${colors.reset}
    `,
    `
                   ${colors.blue}╱ ╲${colors.reset}
                   ${colors.blue}╲ ╱${colors.reset}
    `,
    `
                  ${colors.cyan}╱   ╲${colors.reset}
                 ${colors.cyan}│  ◯  │${colors.reset}
                  ${colors.cyan}╲   ╱${colors.reset}
    `,
    `
                 ${colors.cyan}╭─────╮${colors.reset}
                ${colors.cyan}│ ${colors.bright}╱ ╲${colors.cyan} │${colors.reset}
                ${colors.cyan}│ ${colors.bright}╲ ╱${colors.cyan} │${colors.reset}
                 ${colors.cyan}╰─────╯${colors.reset}
    `,
    `
              ${colors.blue}╭─────────╮${colors.reset}
             ${colors.blue}│ ${colors.cyan}╭─────╮${colors.blue} │${colors.reset}
             ${colors.blue}│${colors.cyan} │ ${colors.bright}${colors.white}◉${colors.reset}${colors.cyan} │ ${colors.blue}│${colors.reset}
             ${colors.blue}│ ${colors.cyan}╰─────╯${colors.blue} │${colors.reset}
              ${colors.blue}╰─────────╯${colors.reset}
    `,
  ];

  // Play arc reactor animation
  for (const frame of frames) {
    clear();
    console.log('\n\n\n');
    console.log(frame);
    await delay(200);
  }

  await delay(300);
  clear();

  // JARVIS ASCII Logo
  const logo = `
${colors.cyan}${colors.bright}
     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗
     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝
     ██║███████║██████╔╝██║   ██║██║███████╗
██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║
╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║
 ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝
${colors.reset}`;

  console.log(logo);
  await delay(500);

  // System initialization messages
  const initMessages = [
    { text: 'Initializing core systems...', delay: 400 },
    { text: 'Loading neural network...', delay: 300 },
    { text: 'Connecting to home automation...', delay: 350 },
    { text: 'Calibrating voice interface...', delay: 300 },
    { text: 'Security protocols active...', delay: 250 },
    { text: 'All systems operational.', delay: 400 },
  ];

  console.log(`\n${colors.dim}────────────────────────────────────────────${colors.reset}\n`);

  for (const msg of initMessages) {
    process.stdout.write(`${colors.blue}  ▸ ${colors.reset}${colors.dim}`);
    await typeText(msg.text, 15);
    console.log(`${colors.reset} ${colors.green}✓${colors.reset}`);
    await delay(msg.delay);
  }

  console.log(`\n${colors.dim}────────────────────────────────────────────${colors.reset}\n`);
  await delay(300);

  // Greeting
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  console.log(`${colors.cyan}${colors.bright}  JARVIS${colors.reset}${colors.dim} v1.0.0${colors.reset}`);
  console.log(`${colors.dim}  Just A Rather Very Intelligent System${colors.reset}\n`);

  process.stdout.write(`  ${colors.cyan}"`);
  await typeText(`${greeting}, ${USER_NAME}. All systems are online and ready.`, 25);
  console.log(`"${colors.reset}\n`);

  await delay(200);
  console.log(`${colors.dim}  Type ${colors.reset}${colors.yellow}help${colors.reset}${colors.dim} for commands, or just talk to me.${colors.reset}`);
  console.log(`${colors.dim}  Type ${colors.reset}${colors.yellow}exit${colors.reset}${colors.dim} to shutdown.${colors.reset}\n`);
  console.log(`${colors.dim}────────────────────────────────────────────${colors.reset}\n`);
}

// Send message to orchestrator
async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${ORCHESTRATOR_URL}/api/chat`);
    const data = JSON.stringify({ message });

    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let fullResponse = '';

      res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.type === 'text' && json.content) {
                process.stdout.write(`${colors.cyan}${json.content}${colors.reset}`);
                fullResponse += json.content;
              } else if (json.type === 'tool_result') {
                console.log(`\n${colors.dim}[${json.tool}]${colors.reset} ${colors.green}✓${colors.reset}`);
              } else if (json.type === 'error') {
                console.log(`\n${colors.red}Error: ${json.content}${colors.reset}`);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      });

      res.on('end', () => {
        console.log('\n');
        resolve(fullResponse);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

// Check if orchestrator is running
async function checkOrchestrator() {
  return new Promise((resolve) => {
    const req = http.get(`${ORCHESTRATOR_URL}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Help command
function showHelp() {
  console.log(`
${colors.cyan}${colors.bright}Available Commands:${colors.reset}

  ${colors.yellow}help${colors.reset}        Show this help message
  ${colors.yellow}clear${colors.reset}       Clear the screen
  ${colors.yellow}status${colors.reset}      Check system status
  ${colors.yellow}tools${colors.reset}       List available tools
  ${colors.yellow}exit${colors.reset}        Shutdown JARVIS

${colors.cyan}${colors.bright}Examples:${colors.reset}

  ${colors.dim}"Open Chrome"${colors.reset}
  ${colors.dim}"What's the weather like?"${colors.reset}
  ${colors.dim}"Turn on the lights"${colors.reset}
  ${colors.dim}"Play some music"${colors.reset}
  ${colors.dim}"Set a reminder for 3pm"${colors.reset}
`);
}

// Status command
async function showStatus() {
  const orchestratorOnline = await checkOrchestrator();

  console.log(`
${colors.cyan}${colors.bright}System Status:${colors.reset}

  ${colors.dim}Orchestrator:${colors.reset}  ${orchestratorOnline ? colors.green + '● Online' : colors.red + '● Offline'}${colors.reset}
  ${colors.dim}OpenAI:${colors.reset}        ${orchestratorOnline ? colors.green + '● Connected' : colors.yellow + '○ Unknown'}${colors.reset}
  ${colors.dim}PC Control:${colors.reset}    ${colors.green}● Ready${colors.reset}
  ${colors.dim}Smart Home:${colors.reset}    ${colors.yellow}○ Mock Mode${colors.reset}
  ${colors.dim}Spotify:${colors.reset}       ${colors.yellow}○ Mock Mode${colors.reset}
  ${colors.dim}Bluetooth:${colors.reset}     ${colors.yellow}○ Mock Mode${colors.reset}
`);
}

// Main function
async function main() {
  await bootSequence();

  // Check if orchestrator is running
  const orchestratorOnline = await checkOrchestrator();
  if (!orchestratorOnline) {
    console.log(`${colors.yellow}⚠ Warning: Orchestrator is not running.${colors.reset}`);
    console.log(`${colors.dim}  Start it with: cd JARVIS/apps/orchestrator && npm run dev${colors.reset}\n`);
  }

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(`${colors.blue}❯ ${colors.reset}`, async (input) => {
      const trimmed = input.trim().toLowerCase();

      if (!trimmed) {
        prompt();
        return;
      }

      // Handle commands
      if (trimmed === 'exit' || trimmed === 'quit' || trimmed === 'bye') {
        console.log(`\n${colors.cyan}"Goodbye, ${USER_NAME}. Have a good day."${colors.reset}\n`);
        process.exit(0);
      }

      if (trimmed === 'help') {
        showHelp();
        prompt();
        return;
      }

      if (trimmed === 'clear' || trimmed === 'cls') {
        clear();
        prompt();
        return;
      }

      if (trimmed === 'status') {
        await showStatus();
        prompt();
        return;
      }

      // Send to JARVIS
      process.stdout.write(`\n${colors.cyan}JARVIS: ${colors.reset}`);

      try {
        await sendMessage(input.trim());
      } catch (err) {
        console.log(`${colors.red}Unable to reach orchestrator. Is it running?${colors.reset}\n`);
      }

      prompt();
    });
  };

  prompt();
}

// Handle exit
process.on('SIGINT', () => {
  console.log(`\n\n${colors.cyan}"Shutting down. Goodbye, ${USER_NAME}."${colors.reset}\n`);
  process.exit(0);
});

main();
