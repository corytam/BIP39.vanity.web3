// tron-vanity-brute.ts (TypeScript)
// Run with: npx tsx tron-vanity-brute.ts

import { randomBytes, createHash } from 'crypto';
import { Mnemonic, HDNodeWallet } from 'ethers';
import bs58 from 'bs58';

const TARGET_PREFIX = 'T'; // <-- change this to your vanity prefix (must start with T)
const MAX_ACCOUNTS = 99999;
const MAX_INDEXES = 99999;
const prettyIndex = true;  // <-- set to false to disable filtering by pretty account/index

// Converts an EVM-style address to TRON Base58Check
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

// Check if number is "pretty":
// - all digits the same (e.g. 1, 11, 111)
// - or digit followed by zeros (e.g. 10, 100, 2000)
function isValidNumber(n: number): boolean {
  const s = n.toString();
  const allSame = s.split('').every(d => d === s[0]);
  const roundNumber = /^([1-9])0*$/.test(s);
  return allSame || roundNumber;
}

// Format mnemonic as 6 rows x 4 columns table, numbered properly
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

let foundGlobal = false;

async function brute() {
  let found = false;

  while (!found) {
    // Generate random 24-word BIP39 phrase
    const entropy = randomBytes(32);
    const mnemonic = Mnemonic.fromEntropy(entropy);
    const hdRoot = HDNodeWallet.fromSeed(mnemonic.computeSeed());

    for (let account = 0; account <= MAX_ACCOUNTS; account++) {
      if (prettyIndex && !isValidNumber(account)) continue;

      console.log(`Checking account ${account}...`);

      for (let index = 0; index <= MAX_INDEXES; index++) {
        if (prettyIndex && !isValidNumber(index)) continue;

        const path = `m/44'/195'/${account}'/0/${index}`;
        const child = hdRoot.derivePath(path);

        const evmAddress = child.address;
        const tronAddress = toTronAddress(evmAddress);

        if (tronAddress.startsWith(TARGET_PREFIX)) {
          console.log('🎉 Found matching TRON address!');
          console.log('Mnemonic:');
          console.log(formatMnemonicTable(mnemonic.phrase));
          console.log(`Derivation Path: ${path}`);
          console.log(`EVM Address: ${evmAddress}`);
          console.log(`TRON Address: ${tronAddress}`);

          found = true;

          const formattedMnemonic = formatMnemonicTable(mnemonic.phrase);

          // Save to file for safety
          const fs = await import('fs/promises');
          await fs.appendFile(
            'matches.txt',
            `\nMnemonic:${formattedMnemonic}\nPath: ${path}\nEVM: ${evmAddress}\nTRON: ${tronAddress}\n`
          );
          return;
        }
      }
    }

    console.log('⏩ Checked one seed, no match — trying next...');
  }
}

brute();