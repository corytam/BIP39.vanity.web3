import { HDNodeWallet, Mnemonic } from 'ethers';
import * as readline from 'readline';
import { createInterface } from 'readline';
import { createHash } from 'crypto';
import bs58 from 'bs58';

// Configure readline for secure input
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to convert EVM address to TRON address
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

// Function to prompt user for input securely
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Function to validate 24-word mnemonic
function isValidMnemonic(phrase: string): boolean {
  const words = phrase.split(' ').filter((word) => word.trim() !== '');
  return words.length === 24 && Mnemonic.isValidMnemonic(phrase);
}

// Function to validate numeric input for indices
function isValidIndex(input: string): boolean {
  const num = parseInt(input, 10);
  return !isNaN(num) && num >= 0 && num <= 99999;
}

// Main function to derive private key
async function derivePrivateKey() {
  try {
    // Prompt for mnemonic phrase
    const mnemonicPhrase = await prompt('Enter your 24-word mnemonic phrase (space-separated): ');
    if (!isValidMnemonic(mnemonicPhrase)) {
      console.error('Error: Invalid mnemonic phrase. Must be 24 words and a valid BIP-39 phrase.');
      rl.close();
      return;
    }

    // Prompt for account index
    const accountIndex = await prompt('Enter account index (0-99999): ');
    if (!isValidIndex(accountIndex)) {
      console.error('Error: Account index must be a number between 0 and 99999.');
      rl.close();
      return;
    }

    // Prompt for address index
    const addressIndex = await prompt('Enter address index (0-99999): ');
    if (!isValidIndex(addressIndex)) {
      console.error('Error: Address index must be a number between 0 and 99999.');
      rl.close();
      return;
    }

    // Derive private key
    const derivationPath = `m/44'/195'/${accountIndex}'/0/${addressIndex}`;
    const mnemonic = Mnemonic.fromPhrase(mnemonicPhrase);
    const hdNode = HDNodeWallet.fromSeed(mnemonic.computeSeed());
    const child = hdNode.derivePath(derivationPath);
    const evmAddress = child.address;
    const tronAddress = toTronAddress(evmAddress);

    // Output only the necessary information
    console.log(`\nDerivation Path: ${derivationPath}`);
    console.log(`Private Key: ${child.privateKey}`);
    console.log(`EVM Address: ${child.address}`);
    console.log(`TRON Address: ${tronAddress}`);

    // Avoid logging sensitive data elsewhere
    // Close readline interface
    rl.close();
  } catch (error) {
    console.error('Error deriving private key:', error instanceof Error ? error.message : 'Unknown error');
    rl.close();
  }
}

// Run the utility
derivePrivateKey();