/**
 * Send BASKET tokens from the deployer wallet to any address.
 *
 * Usage:
 *   MNEMONIC="..." npx ts-node --esm scripts/send-basket-tokens.ts <recipient_address> [amount]
 *
 * Amount defaults to 10,000 BASKET if not specified.
 * Example:
 *   MNEMONIC="..." npx ts-node --esm scripts/send-basket-tokens.ts 0xabc123... 50000
 */

import {
    AddressTypes,
    TransactionFactory,
    type Wallet,
    Mnemonic,
    MLDSASecurityLevel,
    type UTXO,
} from '@btc-vision/transaction';
import { JSONRpcProvider, getContract, OP_20_ABI } from 'opnet';
import { networks, type Network } from '@btc-vision/bitcoin';

const NETWORK: Network = networks.regtest;
const RPC_URL = 'https://regtest.opnet.org';
const BASKET_TOKEN_ADDRESS = '0x0735c44134d2e85e07cd9f89abdbc5527d61d254ae170264558ad42ee2c4b793';
const BASKET_DECIMALS = 8;

function requireEnv(name: string): string {
    const val = process.env[name];
    if (!val) {
        console.error(`ERROR: Missing environment variable ${name}`);
        process.exit(1);
    }
    return val;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUTXOs(
    provider: JSONRpcProvider,
    walletAddress: string,
): Promise<UTXO[]> {
    for (let attempt = 1; attempt <= 24; attempt++) {
        const utxos = await provider.utxoManager.getUTXOs({ address: walletAddress });
        if (utxos.length > 0) return utxos;
        console.log(`  Waiting for UTXOs (attempt ${attempt}/24)...`);
        await sleep(5000);
    }
    throw new Error('No UTXOs available');
}

async function main(): Promise<void> {
    const recipient = process.argv[2];
    if (!recipient) {
        console.error('Usage: MNEMONIC="..." npx ts-node --esm scripts/send-basket-tokens.ts <recipient_address> [amount]');
        console.error('\nConnect your OP_WALLET in the browser, copy your address from the wallet, and paste it here.');
        process.exit(1);
    }

    const amountStr = process.argv[3] || '10000';
    const amount = BigInt(Math.floor(parseFloat(amountStr) * 10 ** BASKET_DECIMALS));

    console.log(`=== Send BASKET Tokens ===`);
    console.log(`  Recipient: ${recipient}`);
    console.log(`  Amount:    ${amountStr} BASKET (${amount} raw)\n`);

    const seedPhrase = requireEnv('MNEMONIC');
    const mnemonic = new Mnemonic(seedPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet: Wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`  From:      ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Get BASKET token contract
    const basketToken = getContract(
        BASKET_TOKEN_ADDRESS,
        OP_20_ABI,
        provider,
        NETWORK,
        wallet.p2tr,
    );

    // Check deployer balance first
    const balResult = await basketToken.balanceOf(wallet.p2tr);
    if (balResult.revert) {
        console.error('  Failed to check balance:', balResult.revert);
        process.exit(1);
    }
    const balance = balResult.properties.balance;
    console.log(`  Balance:   ${(Number(balance) / 1e8).toLocaleString()} BASKET`);

    if (balance < amount) {
        console.error(`  Insufficient balance! Need ${amountStr} BASKET`);
        process.exit(1);
    }

    // Transfer tokens
    console.log('\n--- Sending transfer ---');
    const transferResult = await basketToken.transfer(recipient, amount);
    if (transferResult.revert) {
        console.error('  Transfer simulation failed:', transferResult.revert);
        process.exit(1);
    }

    console.log('  Simulation OK, broadcasting...');

    const utxos = await waitForUTXOs(provider, wallet.p2tr);

    const receipt = await transferResult.sendTransaction({
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        maximumAllowedSatToSpend: 100_000n,
        network: NETWORK,
        utxos,
        feeRate: 5,
    });

    console.log(`  TX ID:     ${receipt.transactionId}`);
    console.log(`\n=== Done! ${amountStr} BASKET sent to ${recipient.slice(0, 12)}... ===`);
    console.log('  Tokens should appear after the next block (~30s on regtest)');
}

main().catch((err: unknown) => {
    console.error('\nFailed:', err);
    process.exit(1);
});
