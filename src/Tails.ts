import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    NetEvent,
    OP_NET,
    Revert,
    SafeMath,
    StoredAddress,
    StoredBoolean,
    StoredMapU256,
    StoredU256,
    AddressMemoryMap,
    TransferHelper,
    U256_BYTE_LENGTH,
    EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';

/** Minimum bet: 10 MOTO (8 decimals) */
const MOTO_DECIMALS: u256 = u256.fromU64(100_000_000);
const MIN_BET: u256 = SafeMath.mul(u256.fromU64(10), MOTO_DECIMALS);

/** House edge: 3% = 300 basis points */
const HOUSE_EDGE_BPS: u256 = u256.fromU64(300);
const BPS_DENOMINATOR: u256 = u256.fromU64(10000);

/** Fee distribution: 25% stakers, 25% buyback, 50% treasury */
const FEE_STAKERS_BPS: u256 = u256.fromU64(2500);
const FEE_BUYBACK_BPS: u256 = u256.fromU64(2500);

/** Bet status constants stored as u256 */
const STATUS_OPEN: u256 = u256.fromU64(1);
const STATUS_SETTLED: u256 = u256.fromU64(2);
const STATUS_CANCELLED: u256 = u256.fromU64(3);

/** u256 constants */
const U256_TWO: u256 = u256.fromU64(2);

/**
 * Storage pointer allocation - each must be unique
 */
const ownerPointer: u16 = Blockchain.nextPointer;
const pausedPointer: u16 = Blockchain.nextPointer;
const motoTokenPointer: u16 = Blockchain.nextPointer;
const flipTokenPointer: u16 = Blockchain.nextPointer;
const stakingContractPointer: u16 = Blockchain.nextPointer;
const treasuryPointer: u16 = Blockchain.nextPointer;
const nextBetIdPointer: u16 = Blockchain.nextPointer;
const totalBetsPointer: u16 = Blockchain.nextPointer;
const totalVolumePointer: u16 = Blockchain.nextPointer;
const totalFeesPointer: u16 = Blockchain.nextPointer;
const stakerFeesPointer: u16 = Blockchain.nextPointer;
const buybackFeesPointer: u16 = Blockchain.nextPointer;
const treasuryFeesPointer: u16 = Blockchain.nextPointer;

/** Per-bet storage maps: betId => value */
const betCreatorPointer: u16 = Blockchain.nextPointer;
const betAcceptorPointer: u16 = Blockchain.nextPointer;
const betAmountPointer: u16 = Blockchain.nextPointer;
const betStatusPointer: u16 = Blockchain.nextPointer;
const betWinnerPointer: u16 = Blockchain.nextPointer;
const betBlockPointer: u16 = Blockchain.nextPointer;

/** Per-user stats maps: address => value */
const userTotalBetsPointer: u16 = Blockchain.nextPointer;
const userTotalWinsPointer: u16 = Blockchain.nextPointer;
const userTotalVolumePointer: u16 = Blockchain.nextPointer;

/**
 * Event: A new bet was created
 */
@final
export class BetCreatedEvent extends NetEvent {
    constructor(betId: u256, creator: Address, amount: u256) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH + 32 + U256_BYTE_LENGTH);
        data.writeU256(betId);
        data.writeAddress(creator);
        data.writeU256(amount);
        super('BetCreated', data);
    }
}

/**
 * Event: A bet was settled
 */
@final
export class BetSettledEvent extends NetEvent {
    constructor(betId: u256, winner: Address, loser: Address, payout: u256) {
        const data: BytesWriter = new BytesWriter(
            U256_BYTE_LENGTH + 32 + 32 + U256_BYTE_LENGTH,
        );
        data.writeU256(betId);
        data.writeAddress(winner);
        data.writeAddress(loser);
        data.writeU256(payout);
        super('BetSettled', data);
    }
}

/**
 * Event: A bet was cancelled
 */
@final
export class BetCancelledEvent extends NetEvent {
    constructor(betId: u256, creator: Address) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH + 32);
        data.writeU256(betId);
        data.writeAddress(creator);
        super('BetCancelled', data);
    }
}

/**
 * Event: Fees distributed
 */
@final
export class FeesDistributedEvent extends NetEvent {
    constructor(stakerShare: u256, buybackShare: u256, treasuryShare: u256) {
        const data: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 3);
        data.writeU256(stakerShare);
        data.writeU256(buybackShare);
        data.writeU256(treasuryShare);
        super('FeesDistributed', data);
    }
}

/**
 * Tails - Provably fair coin flip gambling on OPNet
 *
 * Settlement uses sha256(blockHash + betId) % 2:
 *   0 = creator wins, 1 = acceptor wins
 *
 * Flow:
 *   1. Player A calls createBet(tierIndex) - MOTO transferred from A to contract
 *   2. Player B calls acceptBet(betId) - MOTO transferred from B, settled instantly
 *   3. Winner receives (2 * bet - 3% fee), fee split to stakers/buyback/treasury
 */
@final
export class Tails extends OP_NET {
    private readonly owner: StoredAddress;
    private readonly paused: StoredBoolean;
    private readonly motoToken: StoredAddress;
    private readonly flipToken: StoredAddress;
    private readonly stakingContract: StoredAddress;
    private readonly treasury: StoredAddress;
    private readonly nextBetId: StoredU256;
    private readonly totalBets: StoredU256;
    private readonly totalVolume: StoredU256;
    private readonly totalFees: StoredU256;
    private readonly stakerFees: StoredU256;
    private readonly buybackFees: StoredU256;
    private readonly treasuryFees: StoredU256;

    private readonly betCreator: StoredMapU256;
    private readonly betAcceptor: StoredMapU256;
    private readonly betAmount: StoredMapU256;
    private readonly betStatus: StoredMapU256;
    private readonly betWinner: StoredMapU256;
    private readonly betBlock: StoredMapU256;

    private readonly userTotalBets: AddressMemoryMap;
    private readonly userTotalWins: AddressMemoryMap;
    private readonly userTotalVolume: AddressMemoryMap;

    public constructor() {
        super();

        this.owner = new StoredAddress(ownerPointer);
        this.paused = new StoredBoolean(pausedPointer, false);
        this.motoToken = new StoredAddress(motoTokenPointer);
        this.flipToken = new StoredAddress(flipTokenPointer);
        this.stakingContract = new StoredAddress(stakingContractPointer);
        this.treasury = new StoredAddress(treasuryPointer);
        this.nextBetId = new StoredU256(nextBetIdPointer, EMPTY_POINTER);
        this.totalBets = new StoredU256(totalBetsPointer, EMPTY_POINTER);
        this.totalVolume = new StoredU256(totalVolumePointer, EMPTY_POINTER);
        this.totalFees = new StoredU256(totalFeesPointer, EMPTY_POINTER);
        this.stakerFees = new StoredU256(stakerFeesPointer, EMPTY_POINTER);
        this.buybackFees = new StoredU256(buybackFeesPointer, EMPTY_POINTER);
        this.treasuryFees = new StoredU256(treasuryFeesPointer, EMPTY_POINTER);

        this.betCreator = new StoredMapU256(betCreatorPointer);
        this.betAcceptor = new StoredMapU256(betAcceptorPointer);
        this.betAmount = new StoredMapU256(betAmountPointer);
        this.betStatus = new StoredMapU256(betStatusPointer);
        this.betWinner = new StoredMapU256(betWinnerPointer);
        this.betBlock = new StoredMapU256(betBlockPointer);

        this.userTotalBets = new AddressMemoryMap(userTotalBetsPointer);
        this.userTotalWins = new AddressMemoryMap(userTotalWinsPointer);
        this.userTotalVolume = new AddressMemoryMap(userTotalVolumePointer);
    }

    /**
     * One-time initialization on deployment.
     * Calldata: motoTokenAddress (32 bytes)
     */
    public override onDeployment(calldata: Calldata): void {
        this.owner.value = Blockchain.tx.origin;
        this.nextBetId.value = u256.One;
        const motoAddr: Address = calldata.readAddress();
        this.motoToken.value = motoAddr;
    }

    /**
     * Validates caller is contract owner.
     * @throws {Revert} If caller is not the owner
     */
    private ensureOwner(): void {
        if (!Blockchain.tx.sender.equals(this.owner.value)) {
            throw new Revert('Not owner');
        }
    }

    /**
     * Validates contract is not paused.
     * @throws {Revert} If contract is paused
     */
    private ensureNotPaused(): void {
        if (this.paused.value) {
            throw new Revert('Contract paused');
        }
    }

    /**
     * Validates a bet amount meets the minimum.
     * @param amount - Bet amount in MOTO base units
     * @throws {Revert} If amount is below minimum
     */
    private validateBetAmount(amount: u256): void {
        if (u256.lt(amount, MIN_BET)) {
            throw new Revert('Bet below minimum');
        }
    }

    /**
     * Transfers MOTO tokens from a user to this contract via transferFrom.
     * User must have approved this contract beforehand.
     */
    private pullMoto(from: Address, amount: u256): void {
        TransferHelper.transferFrom(this.motoToken.value, from, Blockchain.contractAddress, amount);
    }

    /**
     * Transfers MOTO tokens from this contract to a recipient.
     */
    private pushMoto(to: Address, amount: u256): void {
        TransferHelper.transfer(this.motoToken.value, to, amount);
    }

    /**
     * Converts an Address to a u256 for use as a StoredMapU256 key.
     */
    private addressToU256(addr: Address): u256 {
        return u256.fromBytes(addr);
    }

    /**
     * Create a new bet with an arbitrary MOTO amount (minimum 10 MOTO).
     * Caller must have approved MOTO transfer to this contract.
     *
     * @param calldata - amount: u256 (in base units, 8 decimals)
     * @returns betId: u256
     */
    @method({ name: 'amount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'betId', type: ABIDataTypes.UINT256 })
    @emit('BetCreated')
    public createBet(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();

        const amount: u256 = calldata.readU256();
        this.validateBetAmount(amount);
        const sender: Address = Blockchain.tx.sender;

        // Pull MOTO from creator
        this.pullMoto(sender, amount);

        // Assign bet ID
        const betId: u256 = this.nextBetId.value;
        this.nextBetId.value = SafeMath.inc(betId);

        // Store bet data
        this.betCreator.set(betId, this.addressToU256(sender));
        this.betAmount.set(betId, amount);
        this.betStatus.set(betId, STATUS_OPEN);
        this.betBlock.set(betId, u256.fromU64(Blockchain.block.number));

        // Update user stats
        this.userTotalBets.set(sender, SafeMath.inc(this.userTotalBets.get(sender)));
        this.userTotalVolume.set(sender, SafeMath.add(this.userTotalVolume.get(sender), amount));

        // Update global stats
        this.totalBets.value = SafeMath.inc(this.totalBets.value);
        this.totalVolume.value = SafeMath.add(this.totalVolume.value, amount);

        this.emitEvent(new BetCreatedEvent(betId, sender, amount));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(betId);
        return response;
    }

    /**
     * Accept an open bet. Instantly settles using provably fair randomness.
     * Caller must have approved MOTO transfer to this contract.
     *
     * Settlement: sha256(blockHash + betId) => last byte % 2
     *   0 = creator wins, 1 = acceptor wins
     *
     * @param calldata - betId: u256
     * @returns winner address hash as u256
     */
    @method({ name: 'betId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'winnerHash', type: ABIDataTypes.UINT256 })
    @emit('BetSettled')
    @emit('FeesDistributed')
    public acceptBet(calldata: Calldata): BytesWriter {
        this.ensureNotPaused();

        const betId: u256 = calldata.readU256();
        const acceptor: Address = Blockchain.tx.sender;

        // Validate bet exists and is open
        const status: u256 = this.betStatus.get(betId);
        if (!u256.eq(status, STATUS_OPEN)) {
            throw new Revert('Bet not open');
        }

        const creatorHash: u256 = this.betCreator.get(betId);
        const acceptorHash: u256 = this.addressToU256(acceptor);

        // Cannot accept your own bet
        if (u256.eq(creatorHash, acceptorHash)) {
            throw new Revert('Cannot accept own bet');
        }

        const amount: u256 = this.betAmount.get(betId);

        // Pull MOTO from acceptor
        this.pullMoto(acceptor, amount);

        // Update bet state BEFORE external calls (checks-effects-interactions)
        this.betAcceptor.set(betId, acceptorHash);
        this.betStatus.set(betId, STATUS_SETTLED);

        // Determine winner: sha256(blockHash || betId) % 2
        const blockHash: Uint8Array = Blockchain.block.hash;
        const betIdBytes: Uint8Array = betId.toUint8Array(true);
        const seedData: BytesWriter = new BytesWriter(32 + U256_BYTE_LENGTH);
        seedData.writeBytes(blockHash);
        seedData.writeU256(betId);
        const resultHash: Uint8Array = Blockchain.sha256(seedData.getBuffer());

        // Use last byte to determine outcome (0 = creator, 1 = acceptor)
        const lastByte: u8 = resultHash[31];
        const creatorWins: bool = (lastByte % 2) === 0;

        // Calculate payout: total pot minus 3% house edge
        const totalPot: u256 = SafeMath.mul(amount, U256_TWO);
        const fee: u256 = SafeMath.div(SafeMath.mul(totalPot, HOUSE_EDGE_BPS), BPS_DENOMINATOR);
        const payout: u256 = SafeMath.sub(totalPot, fee);

        // Distribute fee: 25% stakers, 25% buyback, 50% treasury
        const stakerShare: u256 = SafeMath.div(
            SafeMath.mul(fee, FEE_STAKERS_BPS),
            BPS_DENOMINATOR,
        );
        const buybackShare: u256 = SafeMath.div(
            SafeMath.mul(fee, FEE_BUYBACK_BPS),
            BPS_DENOMINATOR,
        );
        const treasuryShare: u256 = SafeMath.sub(fee, SafeMath.add(stakerShare, buybackShare));

        // Determine winner and loser addresses
        let winner: Address;
        let loser: Address;
        if (creatorWins) {
            winner = Address.fromUint8Array(creatorHash.toUint8Array(true));
            loser = acceptor;
            this.betWinner.set(betId, creatorHash);
        } else {
            winner = acceptor;
            loser = Address.fromUint8Array(creatorHash.toUint8Array(true));
            this.betWinner.set(betId, acceptorHash);
        }

        // Pay winner
        this.pushMoto(winner, payout);

        // Distribute fees
        const stakingAddr: Address = this.stakingContract.value;
        const treasuryAddr: Address = this.treasury.value;

        if (!stakingAddr.isZero() && !u256.eq(stakerShare, u256.Zero)) {
            this.pushMoto(stakingAddr, stakerShare);
        }
        if (!treasuryAddr.isZero() && !u256.eq(treasuryShare, u256.Zero)) {
            this.pushMoto(treasuryAddr, SafeMath.add(treasuryShare, buybackShare));
        }

        // Update fee accumulators
        this.totalFees.value = SafeMath.add(this.totalFees.value, fee);
        this.stakerFees.value = SafeMath.add(this.stakerFees.value, stakerShare);
        this.buybackFees.value = SafeMath.add(this.buybackFees.value, buybackShare);
        this.treasuryFees.value = SafeMath.add(this.treasuryFees.value, treasuryShare);

        // Update acceptor user stats
        this.userTotalBets.set(acceptor, SafeMath.inc(this.userTotalBets.get(acceptor)));
        this.userTotalVolume.set(
            acceptor,
            SafeMath.add(this.userTotalVolume.get(acceptor), amount),
        );

        // Update winner stats
        this.userTotalWins.set(winner, SafeMath.inc(this.userTotalWins.get(winner)));

        this.emitEvent(new BetSettledEvent(betId, winner, loser, payout));
        this.emitEvent(new FeesDistributedEvent(stakerShare, buybackShare, treasuryShare));

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH);
        response.writeU256(this.addressToU256(winner));
        return response;
    }

    /**
     * Cancel an open bet. Only the creator can cancel.
     * Returns the full bet amount to creator.
     *
     * @param calldata - betId: u256
     */
    @method({ name: 'betId', type: ABIDataTypes.UINT256 })
    @emit('BetCancelled')
    public cancelBet(calldata: Calldata): BytesWriter {
        const betId: u256 = calldata.readU256();
        const sender: Address = Blockchain.tx.sender;

        // Validate bet is open
        const status: u256 = this.betStatus.get(betId);
        if (!u256.eq(status, STATUS_OPEN)) {
            throw new Revert('Bet not open');
        }

        // Only creator can cancel
        const creatorHash: u256 = this.betCreator.get(betId);
        if (!u256.eq(creatorHash, this.addressToU256(sender))) {
            throw new Revert('Not bet creator');
        }

        // Mark cancelled before transfer (checks-effects-interactions)
        this.betStatus.set(betId, STATUS_CANCELLED);

        // Refund creator
        const amount: u256 = this.betAmount.get(betId);
        this.pushMoto(sender, amount);

        this.emitEvent(new BetCancelledEvent(betId, sender));

        return new BytesWriter(0);
    }

    /**
     * Get bet details by ID.
     *
     * @param calldata - betId: u256
     * @returns creatorHash, acceptorHash, amount, status, winnerHash, blockNumber
     */
    @method({ name: 'betId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'creator', type: ABIDataTypes.UINT256 },
        { name: 'acceptor', type: ABIDataTypes.UINT256 },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'status', type: ABIDataTypes.UINT256 },
        { name: 'winner', type: ABIDataTypes.UINT256 },
        { name: 'blockNumber', type: ABIDataTypes.UINT256 },
    )
    public getBet(calldata: Calldata): BytesWriter {
        const betId: u256 = calldata.readU256();

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 6);
        response.writeU256(this.betCreator.get(betId));
        response.writeU256(this.betAcceptor.get(betId));
        response.writeU256(this.betAmount.get(betId));
        response.writeU256(this.betStatus.get(betId));
        response.writeU256(this.betWinner.get(betId));
        response.writeU256(this.betBlock.get(betId));
        return response;
    }

    /**
     * Get protocol stats.
     *
     * @returns totalBets, totalVolume, totalFees, nextBetId
     */
    @method()
    @returns(
        { name: 'totalBets', type: ABIDataTypes.UINT256 },
        { name: 'totalVolume', type: ABIDataTypes.UINT256 },
        { name: 'totalFees', type: ABIDataTypes.UINT256 },
        { name: 'nextBetId', type: ABIDataTypes.UINT256 },
    )
    public getStats(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 4);
        response.writeU256(this.totalBets.value);
        response.writeU256(this.totalVolume.value);
        response.writeU256(this.totalFees.value);
        response.writeU256(this.nextBetId.value);
        return response;
    }

    /**
     * Get user stats by address.
     *
     * @param calldata - user: Address
     * @returns totalBets, totalWins, totalVolume
     */
    @method({ name: 'user', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'totalBets', type: ABIDataTypes.UINT256 },
        { name: 'totalWins', type: ABIDataTypes.UINT256 },
        { name: 'totalVolume', type: ABIDataTypes.UINT256 },
    )
    public getUserStats(calldata: Calldata): BytesWriter {
        const user: Address = calldata.readAddress();

        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 3);
        response.writeU256(this.userTotalBets.get(user));
        response.writeU256(this.userTotalWins.get(user));
        response.writeU256(this.userTotalVolume.get(user));
        return response;
    }

    // Tiers removed — bets accept arbitrary amounts (min 10 MOTO)

    /**
     * Set the FLIP token contract address (owner only).
     *
     * @param calldata - flipTokenAddress: Address
     */
    @method({ name: 'flipToken', type: ABIDataTypes.ADDRESS })
    public setFlipToken(calldata: Calldata): BytesWriter {
        this.ensureOwner();
        const addr: Address = calldata.readAddress();
        if (addr.isZero()) {
            throw new Revert('Invalid address');
        }
        this.flipToken.value = addr;
        return new BytesWriter(0);
    }

    /**
     * Set the staking contract address (owner only).
     *
     * @param calldata - stakingAddress: Address
     */
    @method({ name: 'stakingContract', type: ABIDataTypes.ADDRESS })
    public setStakingContract(calldata: Calldata): BytesWriter {
        this.ensureOwner();
        const addr: Address = calldata.readAddress();
        if (addr.isZero()) {
            throw new Revert('Invalid address');
        }
        this.stakingContract.value = addr;
        return new BytesWriter(0);
    }

    /**
     * Set the treasury address (owner only).
     *
     * @param calldata - treasuryAddress: Address
     */
    @method({ name: 'treasury', type: ABIDataTypes.ADDRESS })
    public setTreasury(calldata: Calldata): BytesWriter {
        this.ensureOwner();
        const addr: Address = calldata.readAddress();
        if (addr.isZero()) {
            throw new Revert('Invalid address');
        }
        this.treasury.value = addr;
        return new BytesWriter(0);
    }

    /**
     * Pause the contract (owner only).
     */
    @method()
    public pause(_calldata: Calldata): BytesWriter {
        this.ensureOwner();
        this.paused.value = true;
        return new BytesWriter(0);
    }

    /**
     * Unpause the contract (owner only).
     */
    @method()
    public unpause(_calldata: Calldata): BytesWriter {
        this.ensureOwner();
        this.paused.value = false;
        return new BytesWriter(0);
    }

    /**
     * Transfer ownership (owner only).
     *
     * @param calldata - newOwner: Address
     */
    @method({ name: 'newOwner', type: ABIDataTypes.ADDRESS })
    public transferOwnership(calldata: Calldata): BytesWriter {
        this.ensureOwner();
        const newOwner: Address = calldata.readAddress();
        if (newOwner.isZero()) {
            throw new Revert('Invalid address');
        }
        this.owner.value = newOwner;
        return new BytesWriter(0);
    }

    /**
     * Get fee distribution breakdown.
     *
     * @returns stakerFees, buybackFees, treasuryFees
     */
    @method()
    @returns(
        { name: 'stakerFees', type: ABIDataTypes.UINT256 },
        { name: 'buybackFees', type: ABIDataTypes.UINT256 },
        { name: 'treasuryFees', type: ABIDataTypes.UINT256 },
    )
    public getFeeStats(_calldata: Calldata): BytesWriter {
        const response: BytesWriter = new BytesWriter(U256_BYTE_LENGTH * 3);
        response.writeU256(this.stakerFees.value);
        response.writeU256(this.buybackFees.value);
        response.writeU256(this.treasuryFees.value);
        return response;
    }
}
