// #region Imports

import fs from 'node:fs';
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import os from 'node:os';
import timers from 'node:timers';
import timersPromises from 'node:timers/promises';
import { syncBuiltinESMExports } from 'node:module';

// #endregion

const effects = [];
let internalCallDepth = 0;

function forbidden(name, original) {
    return function (...args) {
        const caller = new Error().stack
            ?.split('\n')
            .slice(2)
            .find(
                (line) =>
                    !line.includes('importProbe.mjs') &&
                    !/\(node:(?:fs|events)(?::|\/)/u.test(line),
            );

        if (internalCallDepth > 0 || caller?.includes('node:internal/')) {
            internalCallDepth++;

            try {
                return Reflect.apply(original, this, args);
            } finally {
                internalCallDepth--;
            }
        }

        effects.push(name);

        throw new Error(`Import-time effect rejected: ${name}`);
    };
}

function protect(object, names, prefix) {
    for (const name of names) {
        if (typeof object[name] === 'function')
            object[name] = forbidden(`${prefix}.${name}`, object[name]);
    }
}

protect(
    fs,
    [
        'readFile',
        'readFileSync',
        'readdir',
        'readdirSync',
        'opendir',
        'opendirSync',
        'stat',
        'statSync',
        'lstat',
        'lstatSync',
        'access',
        'accessSync',
        'existsSync',
        'realpath',
        'realpathSync',
        'open',
        'openSync',
        'mkdir',
        'mkdirSync',
        'writeFile',
        'writeFileSync',
        'rm',
        'rmSync',
        'watch',
        'watchFile',
        'createReadStream',
        'createWriteStream',
    ],
    'fs',
);
protect(
    fs.promises,
    [
        'readFile',
        'readdir',
        'opendir',
        'stat',
        'lstat',
        'access',
        'realpath',
        'open',
        'mkdir',
        'writeFile',
        'rm',
    ],
    'fs.promises',
);
protect(
    childProcess,
    ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'],
    'child_process',
);
protect(net, ['connect', 'createConnection', 'createServer'], 'net');
protect(net.Server.prototype, ['listen'], 'net.Server');
protect(net.Socket.prototype, ['connect'], 'net.Socket');
protect(tls, ['connect', 'createServer'], 'tls');
protect(http, ['request', 'get', 'createServer'], 'http');
protect(https, ['request', 'get', 'createServer'], 'https');
protect(dns, ['lookup', 'resolve', 'resolve4', 'resolve6'], 'dns');
protect(os, ['homedir', 'userInfo', 'tmpdir'], 'os');
protect(timers, ['setTimeout', 'setInterval', 'setImmediate'], 'timers');
protect(timersPromises, ['setTimeout', 'setInterval', 'setImmediate'], 'timers.promises');
protect(globalThis, ['fetch', 'setTimeout', 'setInterval', 'setImmediate'], 'global');
protect(
    process,
    ['on', 'once', 'addListener', 'prependListener', 'prependOnceListener'],
    'process',
);
syncBuiltinESMExports();

try {
    const specifiers = JSON.parse(process.argv[2] ?? '[]');

    for (const specifier of specifiers) await import(specifier);

    if (effects.length) throw new Error('One or more modules attempted import-time effects.');

    process.stdout.write(JSON.stringify({ imports: specifiers.length, effects: [] }) + '\n');
} catch (cause) {
    process.stderr.write(`${cause.message}\n${JSON.stringify({ effects })}\n`);
    process.exitCode = 1;
}
