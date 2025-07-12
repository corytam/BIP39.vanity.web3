// worker.ts
import { randomBytes, createHash } from 'crypto';
import { Mnemonic, HDNodeWallet } from 'ethers';
import bs58 from 'bs58';
import { parentPort, workerData } from 'worker_threads';

const TARGET_PREFIX = 'TP';
const MAX_ACCOUNTS = 99999;
const MAX_INDEXES = 99999;
const prettyIndex = true;

function toTronAddress(evmAddress: string): string {
  const hex = evmAddress.slice(2);
  const tronHex = '41' + hex;
  const tronBuf = Buffer.from(tronHex, 'hex');
  const hash0 = createHash('sha256').update(tronBuf).digest();
  const hash1 = createHash('sha256').update(hash0).digest();
  const checksum = hash1.slice(0, 4);
  const addressBytes = Buffer.concat([tronBuf, checksum]);
  return bs58.encode(addressBytes);
}

/*
const validNumbers = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  11, 22, 33, 44, 55, 66, 77, 88, 99,
  111, 222, 333, 444, 555, 666, 777, 888, 999,
  1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888, 9999,
  11111, 22222, 33333, 44444, 55555, 66666, 77777, 88888, 99999,
  10, 20, 30, 40, 50, 60, 70, 80, 90,
  100, 200, 300, 400, 500, 600, 700, 800, 900,
  1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000,
  10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000
]);*/

const validNumbers = new Set([
  8,88,888,8888,88888
]);


function isValidNumber(n: number): boolean {
  return validNumbers.has(n);
}

/*
function isValidNumber(n: number): boolean {
  const s = n.toString();
  const allSame = s.split('').every(d => d === s[0]);
  const roundNumber = /^([1-9])0*$/.test(s);
  return allSame || roundNumber;
}
*/

function formatMnemonicTable(mnemonic: string): string {
  const words = mnemonic.split(' ');
  const rows = 6;
  const cols = 4;
  const maxNumLength = 2;
  const colWidth = 12;
  let result = '';
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const idx = row + col * rows;
      if (idx < words.length) {
        const w = words[idx]!;
        const num = (idx + 1).toString().padEnd(maxNumLength);
        const word = w.padEnd(colWidth - (maxNumLength + 3));
        line += `${num}) ${word}  `;
      }
    }
    result += line + '\n';
  }
  return result;
}

async function brute(workerId: number) {
  let count=0;
  while (true) {
    count++;

    parentPort?.postMessage({
      type: 'seeds',
      workerId,
      count
    });

    const entropy = randomBytes(32);
    const mnemonic = Mnemonic.fromEntropy(entropy);
    const hdRoot = HDNodeWallet.fromSeed(mnemonic.computeSeed());

    for (let account = 0; account <= MAX_ACCOUNTS; account++) {
      
      // ✅ Send account progress
      /*
      if (account % 1000 === 0) {
        parentPort?.postMessage({
          type: 'account',
          workerId,
          account
        });
      }*/

      if (prettyIndex && !isValidNumber(account)) continue;
      for (let index = 0; index <= MAX_INDEXES; index++) {
        if (prettyIndex && !isValidNumber(index)) continue;
        
        // 🧩 Only send progress every N iterations
        /*
        if (index % 99999 === 0) {
          parentPort?.postMessage({
            type: 'index',
            workerId,
            account,
            index
          });
        }*/

        const path = `m/44'/195'/${account}'/0/${index}`;
        const child = hdRoot.derivePath(path);
        const evmAddress = child.address;
        const tronAddress = toTronAddress(evmAddress);

        if (tronAddress.startsWith(TARGET_PREFIX)) {
          const formattedMnemonic = formatMnemonicTable(mnemonic.phrase);
          const details = `Mnemonic:
${formattedMnemonic}
Derivation Path: ${path}
EVM Address: ${evmAddress}
TRON Address: ${tronAddress}
Private Key: ${child.privateKey}
                            `;

          parentPort?.postMessage({
            type: 'found',
            workerId,
            details,
          });
          return;
        }
      }
    }
  }
}

brute(workerData.workerId);
