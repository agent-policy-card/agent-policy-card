import { encodeFunctionData, maxUint256 } from "viem";
import { toIntent, type Intent } from "./intent.js";
import { TOKEN_ABI } from "./selectors.js";

export type SampleId = "permit" | "transferWithAuthorization" | "setApprovalForAll" | "approveMax";

export const SAMPLE_CARD_CONTRACT: string = "0x2222222222222222222222222222222222222222";

const SIGNER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x3333333333333333333333333333333333333333";
const SPENDER = "0x4444444444444444444444444444444444444444";
const EXPIRES_AT = 4_102_444_800_000;
const RISKS = { riskDetails: [], addresses: {} };

const SIGN_PREVIEW = {
  success: true,
  data: {
    requestId: "sample",
    parsedMessage: { messageType: "SignTypedData" },
    risks: RISKS,
    expiresAt: EXPIRES_AT,
  },
};

const CONTRACT_PREVIEW = {
  success: true,
  data: {
    requestId: "sample",
    parsedTx: {},
    simulationResult: {
      simulationCode: "000000000",
      balanceChanges: [],
      allowanceChanges: [],
      authorityChanges: [],
    },
    risks: RISKS,
    expiresAt: EXPIRES_AT,
  },
};

function signSample(primaryType: string, message: Record<string, unknown>): Intent {
  const typedData = {
    domain: { name: "USD Coin", chainId: 56, verifyingContract: TOKEN },
    primaryType,
    types: {},
    message,
  };
  return toIntent(
    "sign-message preview",
    {
      binanceChainId: "56",
      signType: "EIP712",
      message: JSON.stringify({
        method: "eth_signTypedData_v4",
        params: [SIGNER, JSON.stringify(typedData)],
      }),
    },
    SIGN_PREVIEW,
  );
}

function contractSample(inputData: string): Intent {
  return toIntent(
    "contract-call preview",
    {
      binanceChainId: "56",
      from: SIGNER,
      to: TOKEN,
      value: "0",
      inputData,
    },
    CONTRACT_PREVIEW,
  );
}

export const SAMPLE_INTENTS: { id: SampleId; label: string; intent: Intent }[] = [
  {
    id: "permit",
    label: "Token Permit signature",
    intent: signSample("Permit", {
      owner: SIGNER,
      spender: SPENDER,
      value: "1000000",
      nonce: "0",
      deadline: "4102444800",
    }),
  },
  {
    id: "transferWithAuthorization",
    label: "Transfer authorization signature",
    intent: signSample("TransferWithAuthorization", {
      from: SIGNER,
      to: SPENDER,
      value: "1000000",
      validAfter: "0",
      validBefore: "4102444800",
      nonce: `0x${"00".repeat(31)}01`,
    }),
  },
  {
    id: "setApprovalForAll",
    label: "Approve all NFTs",
    intent: contractSample(
      encodeFunctionData({
        abi: TOKEN_ABI,
        functionName: "setApprovalForAll",
        args: [SPENDER, true],
      }),
    ),
  },
  {
    id: "approveMax",
    label: "Unlimited token approval",
    intent: contractSample(
      encodeFunctionData({
        abi: TOKEN_ABI,
        functionName: "approve",
        args: [SPENDER, maxUint256],
      }),
    ),
  },
];
