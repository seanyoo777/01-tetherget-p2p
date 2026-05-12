/** ABI fragments for EscrowContract.sol — keep in sync with contracts/src/EscrowContract.sol */
export const escrowContractAbi = [
  {
    type: "event",
    name: "EscrowCreated",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: true, name: "seller", type: "address" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Released",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: false, name: "sellerProceeds", type: "uint256" },
      { indexed: false, name: "treasuryFee", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "DisputeRaised",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: true, name: "by", type: "address" },
    ],
  },
  {
    type: "event",
    name: "DisputeResolved",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: false, name: "outcome", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "createEscrow",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "confirmReceipt",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "raiseDispute",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "resolveDispute",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "escrows",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "buyer", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "createdAt", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextEscrowId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "treasury",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "superAdmin",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "disputeResolver",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
];
