import { MOTO_DECIMALS, FLIP_DECIMALS } from '../config/contracts';

function formatUnits(value: bigint, decimals: number): string {
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const divisor = 10n ** BigInt(decimals);
    const whole = abs / divisor;
    const fraction = abs % divisor;
    const prefix = negative ? '-' : '';
    if (fraction === 0n) return `${prefix}${whole}`;
    const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${prefix}${whole}.${fractionStr}`;
}

export function formatMoto(value: bigint): string {
    return formatUnits(value, MOTO_DECIMALS);
}

export function formatFlip(value: bigint): string {
    return formatUnits(value, FLIP_DECIMALS);
}

export function formatNumber(value: string | number): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
}

export function shortenAddress(hex: string, chars: number = 6): string {
    if (hex.length <= chars * 2 + 2) return hex;
    return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

function parseUnits(input: string, decimals: number): bigint {
    const cleaned = input.trim().replace(/[^0-9.]/g, '');
    if (!cleaned || cleaned === '.') return 0n;
    const parts = cleaned.split('.');
    if (parts.length > 2) return 0n;
    const whole = parts[0] || '0';
    let fraction = parts[1] ?? '';
    fraction = fraction.padEnd(decimals, '0').slice(0, decimals);
    try {
        return BigInt(whole + fraction);
    } catch {
        return 0n;
    }
}

export function parseMotoInput(input: string): bigint {
    return parseUnits(input, MOTO_DECIMALS);
}

export function parseFlipInput(input: string): bigint {
    return parseUnits(input, FLIP_DECIMALS);
}

export function isValidNumericInput(input: string): boolean {
    return /^\d*\.?\d*$/.test(input.trim());
}

