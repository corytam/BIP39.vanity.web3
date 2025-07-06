import { Command, Flags } from '@oclif/core';
import { randomBytes } from 'crypto';
import { Wallet, Mnemonic, HDNodeWallet, SigningKey } from 'ethers';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { notify } from 'node-notifier';

export default class Profanity extends Command {
    static description = 'Generate BIP39 vanity addresses using profanity2 GPU acceleration';

    static examples = [
        '$ vanity profanity --leading f --chain eth',
        '$ vanity profanity --matching dead --chain tron',
        '$ vanity profanity --matching TP --chain tron -s',
        '$ vanity profanity --leading-range -m 0 -M 1 --chain eth',
    ];

    static flags = {
        chain: Flags.string({
            char: 'c',
            description: 'The chain type to use for address generation',
            required: false,
            options: ['eth', 'tron'],
            default: 'eth',
        }),
        leading: Flags.string({
            description: 'Score on hashes leading with given hex character',
            required: false,
        }),
        matching: Flags.string({
            description: 'Score on hashes matching given hex string',
            required: false,
        }),
        'leading-range': Flags.boolean({
            description: 'Scores on hashes leading with characters within given range',
            required: false,
        }),
        min: Flags.integer({
            char: 'm',
            description: 'Set range minimum (inclusive), 0 is "0" 15 is "f"',
            required: false,
        }),
        max: Flags.integer({
            char: 'M',
            description: 'Set range maximum (inclusive), 0 is "0" 15 is "f"',
            required: false,
        }),
        'zero-bytes': Flags.boolean({
            char: 'b',
            description: 'Score on hashes containing the most zero bytes',
            required: false,
        }),
        contract: Flags.boolean({
            char: 'C',
            description: 'Score the contract address instead of account address',
            required: false,
        }),
        caseSensitive: Flags.boolean({
            char: 's',
            description: 'Whether the vanity address is case sensitive',
            required: false,
            default: false,
        }),
        output: Flags.file({
            char: 'o',
            description: 'The file to output the addresses to',
            required: false,
        }),
        'profanity-path': Flags.string({
            description: 'Path to profanity2 executable',
            required: false,
            default: 'profanity2',
        }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Profanity);

        // Check if profanity2 is available
        if (!await this.checkProfanity2(flags['profanity-path'])) {
            this.error(`Profanity2 not found at: ${flags['profanity-path']}\n` +
                      'Please install profanity2 from: https://github.com/1inch/profanity2\n' +
                      'Or specify the path with --profanity-path flag');
            return;
        }

        this.log('Generating BIP39 seed with profanity2 GPU acceleration...');

        try {
            // Step 1: Generate a random BIP39 seed phrase
            const entropy = randomBytes(32);
            const mnemonic = Mnemonic.fromEntropy(entropy);
            
            // Step 2: Derive the appropriate private key and public key
            let seedWallet: HDNodeWallet | Wallet; // Be explicit with the type

            if (flags.chain === 'tron') {
                // Use Tron's BIP44 derivation path for the seedWallet
                const hdNode = HDNodeWallet.fromSeed(mnemonic.computeSeed());
                seedWallet = hdNode.derivePath("m/44'/195'/0'/0/0");
            } else {
                // Use default Ethereum derivation path for the seedWallet
                seedWallet = Wallet.fromPhrase(mnemonic.phrase);
            }
            
            // Create a SigningKey instance from the wallet's private key.
            // This works for both HDNodeWallet and Wallet instances.
            const signingKey = new SigningKey(seedWallet.privateKey);
            
            // The .publicKey property on a SigningKey instance is ALWAYS the uncompressed key
            // in the format '0x04' + (128 hex chars).
            // We just need to slice off the '0x04' prefix.
            const publicKeyHex = signingKey.publicKey.slice(4);
            
            // This was already correct and can remain.
            const seedPrivateKey = seedWallet.privateKey.slice(2); 
            
            // This check is still a good idea.
            if (publicKeyHex.length !== 128) {
                this.error(`FATAL: Generated public key has incorrect length (${publicKeyHex.length}). Expected 128. Key: ${publicKeyHex}`);
            }

            this.log(`Generated BIP39 seed phrase: ${mnemonic.phrase}`);
            this.log(`Seed private key: ${seedPrivateKey}`);
            this.log(`Public key for profanity2: ${publicKeyHex}`);

            // Step 4: Build profanity2 command
            const profanityArgs = ['-z', publicKeyHex];
            
            if (flags.leading) profanityArgs.push('--leading', flags.leading);
            if (flags.matching) {

                // Automatically convert the user's pattern to the required hex format
                const hexPattern = this.convertPatternToHex(flags.matching, flags.chain as 'eth' | 'tron');
                profanityArgs.push('--matching', hexPattern);
                // Convert matching pattern for profanity2
                /*
                let pattern = flags.matching;
                if (flags.chain === 'tron' && pattern.startsWith('T')) {
                    // For Tron addresses starting with T, we need to find the hex equivalent
                    // This is a simplified approach - you might need to adjust based on Tron address encoding
                    pattern = pattern.toLowerCase();
                }
                profanityArgs.push('--matching', pattern);
                */
            }
            if (flags['leading-range']) {
                profanityArgs.push('--leading-range');
                if (flags.min !== undefined) profanityArgs.push('-m', flags.min.toString());
                if (flags.max !== undefined) profanityArgs.push('-M', flags.max.toString());
            }
            if (flags['zero-bytes']) profanityArgs.push('--zero-bytes');
            if (flags.contract) profanityArgs.push('--contract');

            this.log(`Running: ${flags['profanity-path']} ${profanityArgs.join(' ')}`);
            this.log('This may take a while depending on the difficulty of your vanity pattern...');

            // Step 5: Run profanity2
            const result = await this.runProfanity2(flags['profanity-path'], profanityArgs);
            
            if (result.success && result.privateKey && result.address) {
                // Step 6: Combine private keys
                const finalPrivateKey = this.addPrivateKeys(seedPrivateKey, result.privateKey);
                
                // Step 7: Create final wallet to verify
                const finalWallet = new Wallet('0x' + finalPrivateKey);
                
                // Step 8: Convert to appropriate chain format
                let finalAddress = finalWallet.address;
                if (flags.chain === 'tron') {
                    finalAddress = this.toTronAddress(finalAddress);
                }

                const output = {
                    mnemonic: mnemonic.phrase,
                    vanityAddress: result.address,
                    finalAddress: finalAddress,
                    seedPrivateKey: '0x' + seedPrivateKey,
                    profanityPrivateKey: '0x' + result.privateKey,
                    finalPrivateKey: '0x' + finalPrivateKey,
                    evmAddress: finalWallet.address,
                    chain: flags.chain
                };

                // Show notification
                notify({
                    title: 'Vanity Address Generated',
                    message: `${flags.chain.toUpperCase()} address: ${finalAddress}`,
                });

                let content = '';
                content += `\n${'24-Word Phrase: '.padEnd(20)}${output.mnemonic}`;
                content += `\n${'Vanity Address: '.padEnd(20)}${output.vanityAddress}`;
                content += `\n${'Final Address: '.padEnd(20)}${output.finalAddress}`;
                if (flags.chain === 'tron') {
                    content += `\n${'EVM Address: '.padEnd(20)}${output.evmAddress}`;
                }
                content += `\n${'Final Private Key: '.padEnd(20)}${output.finalPrivateKey}`;
                content += `\n${'Seed Private Key: '.padEnd(20)}${output.seedPrivateKey}`;
                content += `\n${'Profanity Private Key: '.padEnd(20)}${output.profanityPrivateKey}\n`;

                // Save to file if requested
                if (flags.output) {
                    if (!fs.existsSync(flags.output)) {
                        const dir = path.dirname(flags.output);
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(flags.output, content, { flag: 'a+' });
                    this.log(`Results saved to: ${flags.output}`);
                } else {
                    this.log(content);
                }
            } else {
                this.error('Profanity2 execution failed: ' + result.error);
            }

        } catch (error) {
            this.error('Error: ' + (error as Error).message);
        }
    }

    private async checkProfanity2(profanityPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            // We will no longer split the profanityPath.
            // The path should be the Linux path, e.g., /home/coryt/profanity2/profanity2
    
            // The new, robust command structure
            const command = 'wsl';
            const wslArgs = [
                '--exec',
                '/bin/bash',
                '-c',
                `LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu ${profanityPath} --help` // Note: profanityPath is now part of the string
            ];
    
            const child = spawn(command, wslArgs);
    
            child.on('close', (code) => {
                resolve(code === 0);
            });
            child.on('error', () => {
                resolve(false);
            });
        });
    }
    
    private async runProfanity2(profanityPath: string, args: string[]): Promise<{success: boolean, address?: string, privateKey?: string, error?: string}> {
        return new Promise((resolve) => {
            // The new, robust command structure
            const command = 'wsl';
            const wslArgs = [
                '--exec',
                '/bin/bash',
                '-c',
                // Build the final command string for bash to execute
                `LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu ${profanityPath} ${args.join(' ')}`
            ];
    
            const child = spawn(command, wslArgs);
    
            let stdout = '';
            let stderr = '';
    
            child.stdout.on('data', (data) => {
                stdout += data.toString();
                process.stdout.write(data.toString());
            });
    
            child.stderr.on('data', (data) => {
                stderr += data.toString();
                process.stderr.write(data.toString());
            });
    
            child.on('close', (code) => {
                const result = this.parseProfanityOutput(stdout);
                if (result && result.address && result.privateKey) {
                    resolve({ success: true, ...result });
                } else if (code !== 0) {
                     resolve({ success: false, error: `Profanity2 exited with code ${code}: ${stderr}` });
                } else {
                     resolve({ success: false, error: 'Could not parse profanity2 output. Check the logs above for a result.' });
                }
            });
    
            child.on('error', (error) => {
                resolve({ success: false, error: error.message });
            });
        });
    }

    private parseProfanityOutput(output: string): { address: string, privateKey: string } | null {
        // Parse the profanity2 output to extract address and private key
        const lines = output.split('\n');
        let address = '';
        let privateKey = '';
    
        for (const line of lines) {
            // Look for patterns like "Address: 0x..." or "private: ..."
            // Use a more specific regex for the address to avoid false positives
            const addressMatch = line.match(/(?:Address:|address:)\s*0x([0-9a-fA-F]{40})/);
            if (addressMatch && addressMatch[1]) { // <-- FIX HERE
                address = '0x' + addressMatch[1];
            }
    
            const privateKeyMatch = line.match(/(?:Private:|private:)\s*([0-9a-fA-F]{64})/);
            if (privateKeyMatch && privateKeyMatch[1]) { // <-- FIX HERE
                privateKey = privateKeyMatch[1];
            }
        }
    
        // After looping, if we found both, return the result
        if (address && privateKey) {
            return { address, privateKey };
        }
    
        // If we didn't find both, return null
        return null;
    }

    private addPrivateKeys(key1: string, key2: string): string {
        // Add two private keys modulo the secp256k1 curve order
        const key1BigInt = BigInt('0x' + key1);
        const key2BigInt = BigInt('0x' + key2);
        const curveOrder = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
        
        const result = (key1BigInt + key2BigInt) % curveOrder;
        return result.toString(16).padStart(64, '0');
    }

    private toTronAddress(evmAddress: string): string {
        // Convert EVM address to Tron address
        // This is a simplified version - you might want to use your existing toTronAddress function
        const { sha256 } = require('ethereum-cryptography/sha256');
        const base = require('base-x');
        const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const bs58 = base(BASE58_ALPHABET);
        
        const address = evmAddress.slice(2); // Remove 0x
        const bytes = Buffer.from('41' + address, 'hex');
        const hash = sha256(sha256(bytes));
        return bs58.encode(Buffer.concat([bytes, hash.slice(0, 4)]));
    }

    private convertPatternToHex(pattern: string, chain: 'eth' | 'tron'): string {
        if (chain === 'eth') {
            // For ETH, the pattern must already be hex. We just validate it.
            if (!/^[0-9a-fA-F]*$/.test(pattern)) {
                this.error(`Invalid hexadecimal pattern for ETH chain: ${pattern}`);
            }
            return pattern;
        }

        if (chain === 'tron') {
            // Special handling for Tron 'T' prefix
            if (pattern.startsWith('T')) {
                // A Tron address starting with 'T' corresponds to an EVM address starting with '41'.
                // The rest of the pattern needs to be converted from Base58 to a hex-like search pattern.
                // This is a simplified "best-effort" conversion.
                const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
                let hexPattern = '41'; // Start with the mandatory '41' for Tron 'T' addresses

                // We start checking from the second character of the pattern
                for (let i = 1; i < pattern.length; i++) {
                    const char = pattern[i];

                    // Add a guard to ensure 'char' is not undefined before using it.
                    if (char === undefined) {
                        // This case should not be hit due to the loop condition, but it satisfies TypeScript.
                        break;
                    }

                    const index = base58Chars.indexOf(char);

                    if (index === -1) {
                        this.error(`Invalid character in Tron pattern: '${char}'. Only Base58 characters are allowed.`);
                    }

                    // Simplified logic: find hex characters that could encode to this Base58 character.
                    // This is not a perfect 1-to-1 mapping, but it's a good heuristic for searching.
                    // 'P' in Base58 is index 23. In hex, this is 17.
                    // We'll just convert the index to a hex string for the search.
                    if (index < 16) {
                        hexPattern += index.toString(16);
                    } else {
                        // For characters beyond 'F', the search becomes more complex.
                        // A simple approach is to stop or use a wildcard, but for now we will just append the hex value
                        // of the index. This might not yield perfect results but is a good start.
                        // For 'P' (index 23), hex is '17'. So we search for '...17...'
                        hexPattern += index.toString(16);
                    }
                }
                this.log(`Tron pattern '${pattern}' converted to hex search pattern: '${hexPattern}'`);
                return hexPattern;
            }
            // If not starting with 'T', assume it's a hex pattern for the EVM address part
            if (!/^[0-9a-fA-F]*$/.test(pattern)) {
                this.error(`Invalid hexadecimal pattern for Tron chain: ${pattern}`);
            }
            return pattern;
        }

        return pattern; // Default fallback
    }
}