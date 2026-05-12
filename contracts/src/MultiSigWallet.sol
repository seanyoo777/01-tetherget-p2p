// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MultiSigWallet
 * @notice Lightweight Gnosis-style flow for tribunal calls (encode EscrowContract.resolveDispute(id, outcome)).
 *         Typical deployment: 3 admin owners + threshold 2 (two signatures required).
 *         `superOwner` (SuperAdmin cold wallet): one approve satisfies full threshold — expedited / final multisig path.
 *         Escrow also allows `superAdmin` to call resolveDispute directly (on-chain final arbiter beyond multisig).
 */
contract MultiSigWallet {
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public threshold;
    address public superOwner;

    uint256 public proposalCount;

    struct Proposal {
        address to;
        uint256 value;
        bytes data;
        uint256 approvals;
        bool executed;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;

    event OwnerAdded(address indexed o);
    event ProposalCreated(uint256 indexed id, address indexed to, uint256 value);
    event Approved(uint256 indexed id, address indexed signer);
    event Executed(uint256 indexed id, bytes result);

    error Unauthorized();
    error InvalidProposal();
    error AlreadyApproved();
    error AlreadyExecuted();
    error ThresholdNotMet();
    error CallFailed();

    modifier onlyOwner() {
        if (!isOwner[msg.sender] && msg.sender != superOwner) revert Unauthorized();
        _;
    }

    constructor(address[] memory _owners, uint256 _threshold, address _superOwner) {
        if (_owners.length < _threshold || _threshold == 0) revert InvalidProposal();
        superOwner = _superOwner;
        threshold = _threshold;
        for (uint256 i = 0; i < _owners.length; i++) {
            address o = _owners[i];
            if (o == address(0) || isOwner[o]) revert InvalidProposal();
            isOwner[o] = true;
            owners.push(o);
            emit OwnerAdded(o);
        }
    }

    function propose(address to, uint256 value, bytes calldata data) external onlyOwner returns (uint256 id) {
        if (to == address(0)) revert InvalidProposal();
        id = ++proposalCount;
        proposals[id] = Proposal({to: to, value: value, data: data, approvals: 0, executed: false});
        emit ProposalCreated(id, to, value);
    }

    function approve(uint256 id) external onlyOwner {
        Proposal storage p = proposals[id];
        if (p.to == address(0)) revert InvalidProposal();
        if (p.executed) revert AlreadyExecuted();
        if (hasApproved[id][msg.sender]) revert AlreadyApproved();
        hasApproved[id][msg.sender] = true;
        if (msg.sender == superOwner) {
            p.approvals = threshold;
        } else {
            p.approvals += 1;
        }
        emit Approved(id, msg.sender);
    }

    function execute(uint256 id) external onlyOwner {
        Proposal storage p = proposals[id];
        if (p.to == address(0)) revert InvalidProposal();
        if (p.executed) revert AlreadyExecuted();
        if (p.approvals < threshold) revert ThresholdNotMet();
        p.executed = true;
        (bool ok, bytes memory ret) = p.to.call{value: p.value}(p.data);
        if (!ok) revert CallFailed();
        emit Executed(id, ret);
    }

    receive() external payable {}
}
