# THIS IS A HOBBY PROJECT , USE AT YOUR OWN RISK

# ----- Override instructions --------

# MULTIPLE SOLUTIONS CAN BE USED

1. Address.ts
2. Multithread (recommended)
   3)tron-vanity-brute (archive)
3. Profantity ( beta , untested)

For mul[tithread just install all packagesand compile
[Install]
npm install

[Compile files in commandline]
npx tsc

R[un from dist]
node dist/multithread/master.js

# After forking , run the following as example

.\bin\dev.cmd address TP -c tron -s -o output.txt

# ---------END OVERRIDE--------

# ------ vanity.web3-----------------

24 BIP39 compliant Vanity address generator for web3 in command line.

Supports EVM-Chains(Ethereum, Binance Smart Chain, Polygon, Avalanche etc, and it's contract address), Solana, Tron and Aptos.

Examples:

-   EVM: `0xbbBBF4d7FDF3E6993218FC8Cbd5975E34BB47777`
-   Solana: `SoLQCis48RxKMYKL26gBJDyofzVUweQd66S3xD8t4MS`
-   Contract Address: [`0x000007b812f197453E29819fb0B4EC543119e33E`](https://ropsten.etherscan.io/tx/0xd36e988000f962a0320feef17cd2ce7d6ff49d42f44e495edd616cac88ab10ef) created by private key `84c8745d552640833096ff7b7982f2cf9862b48610e2a1bb25fe53250f1f8b71`
-   Tron: `TRXonvpjGWKgu4MQdJHJhQN6mtmjFkM7HX`, `0xAAB43D4E91EBC9A2e475b80BE725F8791C4e3C7d`
-   Aptos: `0x000000616a48469384a03540e9b391d9753c1e2cde382d058a58975585fca596`

## Installation

-   NPM: `npm install -g vanity.web3`
-   Yarn: `yarn global add vanity.web3`

## Usage

```shell
Vanity address generator for web3 in command line, supports ethereum, solana, tron and aptos

VERSION
  vanity.web3/0.3.0 darwin-x64 node-v16.14.2

USAGE
  $ vanity [COMMAND]

COMMANDS
  address       Generate vanity address
  autocomplete  display autocomplete installation instructions
  help          Display help for vanity.
```

Just run `vanity address` to generate a vanity address, and you can get notified when the address is available.

```shell
Generate vanity address

USAGE
  $ vanity address [PREFIX] [SUFFIX] [-c evm|solana|aptos|tron] [-s] [-w <value>] [-n <value>] [-o <value>] [-C]

ARGUMENTS
  PREFIX  The prefix to use for the vanity address, supports multiple prefixes separated by commas
  SUFFIX  The suffix to use for the vanity address, supports multiple suffixes separated by commas

FLAGS
  -C, --contract         Whether the vanity address is for a contract address, now only supports evm
  -c, --chain=<option>   [default: evm] The chain type to use for address generation
                         <options: evm|solana|aptos|tron>
  -n, --num=<value>      [default: 1] The number of addresses to generate
  -o, --output=<value>   The file to output the addresses to
  -s, --caseSensitive    Whether the vanity address is case sensitive
  -w, --workers=<value>  The number of workers to use for address generation, defaults to the half of the number of CPUs

DESCRIPTION
  Generate vanity address

EXAMPLES
  $ vanity address 012,111 abc,def -s -w 2

  $ vanity address 000 -C

  $ vanity address so,far so,good -c solana -n 2

  $ vanity address 0000 1111 -c aptos -w 1 -n 2 -o output.txt

  $ vanity address trx -c tron
```

## Donate

|                                                               ETH: `0xbbBBF4d7FDF3E6993218FC8Cbd5975E34BB47777`                                                                |                                                               SOL: `SoLQCis48RxKMYKL26gBJDyofzVUweQd66S3xD8t4MS`                                                                |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| <img src="https://user-images.githubusercontent.com/5813232/184662542-23314cbb-e949-4ae9-b6b2-26af134c68ee.png" alt="0xbbBBF4d7FDF3E6993218FC8Cbd5975E34BB47777" width="270"/> | <img src="https://user-images.githubusercontent.com/5813232/184808707-00f59179-fd85-4a60-a65e-a923769d6f7f.png" alt="SoLQCis48RxKMYKL26gBJDyofzVUweQd66S3xD8t4MS" width="270"/> |

## License

[MIT](./LICENSE)

### USE WITH PROFANITY

## For windows users

## Install wsl and Unbuntu distribution

## Go into Ubuntu terminal

sudo apt update
sudo apt install build-essential git

## Clone profanity2

git clone https://github.com/1inch/profanity2.git
cd profanity2

## Still in In Ubuntu terminal , Install the OpenCL Development Files requirecd for profanity

sudo apt install ocl-icd-opencl-dev
make clean
make

## Make sure default WSL distribution is Ubuntu , inside windows powershell enter

wsl --set-default Ubuntu

## Test command in Windows Powershell if it works

wsl --exec /bin/bash -c "LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu /home/coryt/profanity2/profanity2 --help"

## Now run following command to create seed phrase starting with TP

.\bin\dev.cmd profanity --matching TP --chain tron -s --profanity-path "/home/coryt/profanity2/profanity2"
