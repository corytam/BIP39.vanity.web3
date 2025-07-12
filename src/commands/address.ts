import { Command, Flags } from '@oclif/core';
import { privateToAddress, toBuffer, toChecksumAddress } from '@ethereumjs/util';
import { randomBytes } from 'crypto';
import { sha3_256 } from 'js-sha3';
import * as fs from 'fs';
import * as path from 'path';
import * as nacl from 'tweetnacl';
import cluster from 'cluster';
import * as os from 'os';
import { notify } from 'node-notifier';
import base from 'base-x';
import * as RLP from 'rlp';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { sha256 } from 'ethereum-cryptography/sha256';
import { OutputFlags } from '@oclif/core/lib/interfaces';
import { Wallet, getAddress, Mnemonic, HDNodeWallet } from 'ethers';

const HEX_CHARS = '0123456789ABCDEFabcdef';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const bs58 = base(BASE58_ALPHABET);

export default class Address extends Command {
    static description = 'Generate vanity address';

    static examples = [
        '$ vanity address 012,111 abc,def -s -w 2',
        '$ vanity address 000 -C',
        '$ vanity address so,far so,good -c solana -n 2',
        '$ vanity address 0000 1111 -c aptos -w 1 -n 2 -o output.txt',
        '$ vanity address trx -c tron',
    ];

    static args = [
        {
            name: 'prefix',
            description: 'The prefix to use for the vanity address, supports multiple prefixes separated by commas',
            required: false,
            default: '',
        },
        {
            name: 'suffix',
            description: 'The suffix to use for the vanity address, supports multiple suffixes separated by commas',
            required: false,
            default: '',
        },
    ];

    static flags = {
        chain: Flags.string({
            char: 'c',
            description: 'The chain type to use for address generation',
            required: false,
            options: ['evm', 'solana', 'aptos', 'tron'],
            default: 'evm',
        }),
        caseSensitive: Flags.boolean({
            char: 's',
            description: 'Whether the vanity address is case sensitive',
            required: false,
            default: false,
        }),
        workers: Flags.integer({
            char: 'w',
            description: 'The number of workers to use for address generation, defaults to the half of the number of CPUs',
            required: false,
        }),
        num: Flags.integer({
            char: 'n',
            description: 'The number of addresses to generate',
            required: false,
            default: 1,
        }),
        output: Flags.file({
            char: 'o',
            description: 'The file to output the addresses to',
            required: false,
        }),
        contract: Flags.boolean({
            char: 'C',
            description: 'Whether the vanity address is for a contract address, now only supports evm',
            required: false,
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Address);
        const prefixes: string[] = (flags.caseSensitive ? args.prefix : args.prefix.toLowerCase()).split(',').filter((i: any) => i);
        const suffixes: string[] = (flags.caseSensitive ? args.suffix : args.suffix.toLowerCase()).split(',').filter((i: any) => i);
        const workers = Math.max(1, flags.workers || Math.floor(os.cpus().length / 2));
        const num = Math.max(1, flags.num);

        if (prefixes.some((p) => p.length > 20) || suffixes.some((s) => s.length > 20)) {
            this.error('Prefix and suffix must be less than 20 characters');
            return;
        }

        let isValid: any;
        if ((isValid = isValidChars(flags.chain, prefixes, suffixes, flags.caseSensitive)) !== true) {
            this.error(isValid.error);
            return;
        }

        let generator;
        switch (flags.chain) {
            case 'evm':
            case 'tron':
                generator = generateEvmAddress;

                break;
            case 'solana':
            case 'aptos':
            default:
                generator = generateEd25519Address;

                break;
        }

        if (cluster.isMaster || cluster.isPrimary) {
            this.log(`Generating ${flags.chain} vanity address...`);
            let count = 0;
            for (let i = 0; i < workers; i++) {
                const child = cluster.fork();
                // V-- FIX: Listen for 'exit' instead of 'message' --V
                child.on('exit', () => {
                    count++;
                    this.log(`Vanity address #${count} found and saved.`);
                    if (count >= num) {
                        this.log('All requested addresses have been generated. Exiting.');
                        // Kill any remaining workers
                        for (const id in cluster.workers) {
                            cluster.workers[id]?.process.kill();
                        }
                    }
                });

                /*
                child.on('message', (message: any) => {
                    if (message.generated) {
                        count++;
                        if (count >= num) {
                            for (const id in cluster.workers) {
                                cluster.workers[id]?.process.kill();
                            }
                        }
                    }
                });*/
            }
        } else {
            const { address, privateKey, publicKey, contract, evmAddress , mnemonic } = generator(prefixes, suffixes, flags);

            notify({
                title: 'Vanity Address Generated',
                message: !!contract ? contract : address,
            });

            let content = '';
            if (!!contract) {
                content += `\n${'Vanity Contract: '.padEnd(18)}${contract}`;
            }
            content += `\n${'Vanity Address: '.padEnd(18)}${address}`;
            if (!!evmAddress) {
                content += `\n${'EVM Address: '.padEnd(18)}${evmAddress}`;
            }
            if (!!publicKey) {
                content += `\n${'Public Key: '.padEnd(18)}${publicKey}`;
            }
            if (!!mnemonic) {
                content += `\n${'24-Word Phrase: '.padEnd(20)} \n${formatMnemonicTable(mnemonic)}`;
            }
            content += `\n${'Private Key: '.padEnd(18)}${privateKey}\n`;

            if (flags.output) {
                if (!fs.existsSync(flags.output)) {
                    const dir = path.dirname(flags.output);
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(flags.output, content, { flag: 'a+' });
            } else {
                this.log(content);
            }

            process.send && process.send({ generated: true });
        }
    }
}

function isValidChars(chain: string, prefixes: string[], suffixes: string[], caseSensitive = false) {
    let type = '',
        alphabet = '';
    switch (chain) {
        case 'evm':
        case 'aptos':
            type = 'hex';
            alphabet = HEX_CHARS;

            break;
        case 'solana':
        case 'tron':
            type = 'base58';
            alphabet = BASE58_ALPHABET;
    }

    if (
        !prefixes.every((p) => stringIncludes(alphabet, p, caseSensitive)) ||
        !suffixes.every((s) => stringIncludes(alphabet, s, caseSensitive))
    ) {
        return { error: `Prefix and suffix must be ${type} strings(${alphabet}) for ${chain}` };
    }

    return true;
}

function stringIncludes(string: string, substring: string, caseSensitive = false) {
    if (substring.length < 1) {
        return true;
    }

    if (!caseSensitive) {
        string = string.toLowerCase();
    }

    return substring.split('').every((char) => string.includes(char));
}

function toTronAddress(address: string) {
    const bytes = toBuffer('0x41' + address);
    const hash = sha256(sha256(bytes));

    return bs58.encode(Buffer.concat([bytes, hash.slice(0, 4)]));
}

function generateEvmAddress(prefixes: string[], suffixes: string[], flags: OutputFlags<any>): any {
    let address = '';
    let privateKey = '';
    let contract, evmAddress;
    let mnemonicPhrase = '';

    if (flags.contract) {
        throw new Error('BIP39 mnemonic generation is not supported for contract addresses with this script.');
    }
    
    do {
        // 1. Generate 256 bits (32 bytes) of entropy for a 24-word phrase
        const entropy = randomBytes(32);

        // 2. Create the Mnemonic object from the entropy
        const mnemonic = Mnemonic.fromEntropy(entropy);

        // 3. Create HDNodeWallet from mnemonic with proper derivation path
        let wallet;
        if (flags.chain === 'tron') {
            // Use Tron's BIP44 derivation path: m/44'/195'/0'/0/0
            const hdNode = HDNodeWallet.fromSeed(mnemonic.computeSeed());
            wallet = hdNode.derivePath("m/44'/195'/0'/0/0");
        } else {
            // Use default derivation path for other EVM chains
            wallet = Wallet.fromPhrase(mnemonic.phrase);
        }
        
        const tempAddress = wallet.address.substring(2);
        privateKey = wallet.privateKey;
        mnemonicPhrase = mnemonic.phrase;

        if (flags.chain === 'tron') {
            evmAddress = wallet.address;
            const tronAddress = toTronAddress(tempAddress.toLowerCase());
            address = flags.caseSensitive ? tronAddress : tronAddress.toLowerCase();
        } else {
            if (flags.caseSensitive) {
                address = wallet.address.substring(2);
            } else {
                address = tempAddress.toLowerCase();
            }
        }
    } while (
        (prefixes.length > 0 && !prefixes.some((p) => address.startsWith(p))) ||
        (suffixes.length > 0 && !suffixes.some((s) => address.endsWith(s)))
    );

    // Prepare the final output
    if (flags.chain === 'tron') {
        address = toTronAddress((evmAddress as string).substring(2).toLowerCase());
    } else {
        address = getAddress('0x' + privateToAddress(toBuffer(privateKey)).toString('hex'));
    }

    return { address, privateKey, evmAddress, mnemonic: mnemonicPhrase };
}

function generateEd25519Address(prefixes: string[], suffixes: string[], flags: OutputFlags<any>): any {
    let address = '';
    let keypair, publicKey, privateKey;
    do {
        keypair = nacl.sign.keyPair();
        if (flags.chain === 'aptos') {
            const hasher = sha3_256.create();
            hasher.update(keypair.publicKey);
            hasher.update('\x00');
            address = hasher.hex();
        } else {
            address = bs58.encode(keypair.publicKey);
        }

        if (!flags.caseSensitive) {
            address = address.toLowerCase();
        }
    } while (
        (prefixes.length > 0 && !prefixes.some((p) => address.startsWith(p))) ||
        (suffixes.length > 0 && !suffixes.some((s) => address.endsWith(s)))
    );

    if (flags.chain === 'aptos') {
        address = '0x' + address;
        publicKey = '0x' + Buffer.from(keypair.publicKey).toString('hex');
        privateKey = Buffer.from(keypair.secretKey).slice(0, 32).toString('hex');
    } else {
        address = bs58.encode(keypair.publicKey);
        privateKey = Buffer.from(keypair.secretKey).toString('hex');
    }

    return { address, privateKey, publicKey };
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
