// Simple validation script to check health check implementation
const fs = require('fs');

console.log('Validating health check implementation in contatti.html...\n');

const content = fs.readFileSync('contatti.html', 'utf-8');

// Check for required components
const checks = [
    {
        name: 'Health Check Object',
        pattern: /const healthCheck = \{/,
        required: true
    },
    {
        name: 'Health Check Endpoint',
        pattern: /endpoint: 'https:\/\/.*\/api\/health\/'/,
        required: true
    },
    {
        name: '5 Second Timeout',
        pattern: /timeout: 5000/,
        required: true
    },
    {
        name: 'AbortController',
        pattern: /new AbortController\(\)/,
        required: true
    },
    {
        name: 'Promise.race for Timeout',
        pattern: /Promise\.race\(/,
        required: true
    },
    {
        name: 'Health Status Indicator CSS',
        pattern: /\.health-status-indicator/,
        required: true
    },
    {
        name: 'Health Status HTML Element',
        pattern: /id="healthStatus"/,
        required: true
    },
    {
        name: 'Checking State CSS',
        pattern: /\.health-status-indicator\.checking/,
        required: true
    },
    {
        name: 'Success State CSS',
        pattern: /\.health-status-indicator\.success/,
        required: true
    },
    {
        name: 'Error State CSS',
        pattern: /\.health-status-indicator\.error/,
        required: true
    },
    {
        name: 'Italian Status Messages',
        pattern: /Verifica connessione al server/,
        required: true
    },
    {
        name: 'DOMContentLoaded Health Check',
        pattern: /document\.addEventListener\('DOMContentLoaded'.*healthCheck\.performCheck/s,
        required: true
    },
    {
        name: 'Form Submit Health Check',
        pattern: /healthCheck\.shouldRecheck\(\)/,
        required: true
    },
    {
        name: 'Network Error Re-check',
        pattern: /healthCheck\.status = 'error'.*await healthCheck\.performCheck/s,
        required: true
    }
];

let allPassed = true;

checks.forEach(check => {
    const found = check.pattern.test(content);
    const status = found ? '✓' : '✗';
    const color = found ? '\x1b[32m' : '\x1b[31m';
    
    console.log(`${color}${status}\x1b[0m ${check.name}`);
    
    if (check.required && !found) {
        allPassed = false;
    }
});

console.log('\n' + (allPassed ? '\x1b[32m✓ All checks passed!\x1b[0m' : '\x1b[31m✗ Some checks failed\x1b[0m'));
process.exit(allPassed ? 0 : 1);
