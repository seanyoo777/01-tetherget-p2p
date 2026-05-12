// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal ERC20 interface for USDT/USDC-style tokens on Base / Arbitrum.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title EscrowContract
 * @notice Non-custodial P2P USDT escrow: seller locks on-chain; buyer confirms release.
 *         Fees (1% buyer + 1% seller of locked notional = 2% total) go to `treasury` on seller release path.
 *         Disputes: primary resolution via `disputeResolver` (MultiSigWallet, e.g. 2-of-3 admins).
 *         `superAdmin` may also call resolveDispute — final on-chain arbiter (multisig deadlock / policy).
 *         Company never custodies user funds off-chain; rules are enforced by this contract.
 */
contract EscrowContract {
    IERC20 public immutable token;
    address public treasury;
    /// @notice MultiSigWallet (e.g. 2-of-3). Together with superAdmin may call resolveDispute.
    address public disputeResolver;
    /// @notice Human governance — emergencyWithdraw only (timelock recommended off-chain).
    address public superAdmin;

    /// @dev Total fee basis points taken from locked amount on release-to-seller (buyer 100 + seller 100 = 200 bps).
    uint256 public constant FEE_BPS_TOTAL = 200;
    uint256 public constant BPS_DENOM = 10_000;

    enum Status {
        None,
        Funded,
        Released,
        Disputed,
        RefundedToBuyer,
        EmergencyWithdrawn
    }

    struct Escrow {
        address seller;
        address buyer;
        uint256 amount;
        Status status;
        uint256 createdAt;
    }

    mapping(uint256 => Escrow) public escrows;
    uint256 public nextEscrowId;

    event EscrowCreated(uint256 indexed id, address indexed seller, address indexed buyer, uint256 amount);
    event Released(uint256 indexed id, uint256 sellerProceeds, uint256 treasuryFee);
    event DisputeRaised(uint256 indexed id, address indexed by);
    event DisputeResolved(uint256 indexed id, uint8 outcome);
    event EmergencyWithdraw(uint256 indexed id, address indexed to, uint256 amount);
    event TreasuryUpdated(address indexed treasury);
    event DisputeResolverUpdated(address indexed resolver);
    event SuperAdminUpdated(address indexed admin);

    error InvalidState();
    error Unauthorized();
    error ZeroAddress();
    error TransferFailed();

    constructor(address _token, address _treasury, address _disputeResolver, address _superAdmin) {
        if (
            _token == address(0) || _treasury == address(0) || _disputeResolver == address(0)
                || _superAdmin == address(0)
        ) revert ZeroAddress();
        token = IERC20(_token);
        treasury = _treasury;
        disputeResolver = _disputeResolver;
        superAdmin = _superAdmin;
    }

    function setTreasury(address v) external {
        if (msg.sender != superAdmin) revert Unauthorized();
        if (v == address(0)) revert ZeroAddress();
        treasury = v;
        emit TreasuryUpdated(v);
    }

    function setDisputeResolver(address v) external {
        if (msg.sender != superAdmin) revert Unauthorized();
        if (v == address(0)) revert ZeroAddress();
        disputeResolver = v;
        emit DisputeResolverUpdated(v);
    }

    function setSuperAdmin(address v) external {
        if (msg.sender != superAdmin) revert Unauthorized();
        if (v == address(0)) revert ZeroAddress();
        superAdmin = v;
        emit SuperAdminUpdated(v);
    }

    /**
     * @notice Seller creates escrow and locks `amount` of token (must approve this contract first).
     * @param buyer Counterparty buyer address (matched off-chain / via your app).
     * @param amount Raw token amount (USDT 6 decimals on Base — pass human amounts off-chain * 1e6).
     */
    function createEscrow(address buyer, uint256 amount) external returns (uint256 id) {
        if (buyer == address(0) || amount == 0) revert ZeroAddress();
        id = ++nextEscrowId;
        escrows[id] = Escrow({
            seller: msg.sender,
            buyer: buyer,
            amount: amount,
            status: Status.Funded,
            createdAt: block.timestamp
        });
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit EscrowCreated(id, msg.sender, buyer, amount);
    }

    /// @notice Buyer confirms receipt — seller receives net of protocol fees; treasury receives 2% total (1%+1%).
    function confirmReceipt(uint256 id) external {
        Escrow storage e = escrows[id];
        if (e.status != Status.Funded) revert InvalidState();
        if (msg.sender != e.buyer) revert Unauthorized();
        _releaseToSeller(e, id);
    }

    function raiseDispute(uint256 id) external {
        Escrow storage e = escrows[id];
        if (e.status != Status.Funded) revert InvalidState();
        if (msg.sender != e.buyer && msg.sender != e.seller) revert Unauthorized();
        e.status = Status.Disputed;
        emit DisputeRaised(id, msg.sender);
    }

    /**
     * @notice Tribunal resolution: `disputeResolver` (multisig 2-of-3) OR `superAdmin` (final authority).
     * @param outcome 0 = pay seller (same fee split as confirmReceipt), 1 = full refund to buyer (no treasury fee).
     */
    function resolveDispute(uint256 id, uint8 outcome) external {
        if (msg.sender != disputeResolver && msg.sender != superAdmin) revert Unauthorized();
        Escrow storage e = escrows[id];
        if (e.status != Status.Disputed) revert InvalidState();
        if (outcome == 0) {
            _releaseToSeller(e, id);
        } else if (outcome == 1) {
            e.status = Status.RefundedToBuyer;
            if (!token.transfer(e.buyer, e.amount)) revert TransferFailed();
        } else {
            revert InvalidState();
        }
        emit DisputeResolved(id, outcome);
    }

    /**
     * @notice Governance-only escape hatch — does not route through company balance; on-chain policy decision.
     * @param to Recipient of full locked amount (e.g. stale escrow returned to seller).
     */
    function emergencyWithdraw(uint256 id, address to) external {
        if (msg.sender != superAdmin) revert Unauthorized();
        if (to == address(0)) revert ZeroAddress();
        Escrow storage e = escrows[id];
        if (e.status != Status.Funded && e.status != Status.Disputed) revert InvalidState();
        uint256 amt = e.amount;
        e.status = Status.EmergencyWithdrawn;
        if (!token.transfer(to, amt)) revert TransferFailed();
        emit EmergencyWithdraw(id, to, amt);
    }

    function _releaseToSeller(Escrow storage e, uint256 id) internal {
        e.status = Status.Released;
        uint256 fee = (e.amount * FEE_BPS_TOTAL) / BPS_DENOM;
        uint256 toSeller = e.amount - fee;
        if (!token.transfer(e.seller, toSeller)) revert TransferFailed();
        if (!token.transfer(treasury, fee)) revert TransferFailed();
        emit Released(id, toSeller, fee);
    }
}
