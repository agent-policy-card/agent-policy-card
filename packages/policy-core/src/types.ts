export type Eip712AllowEntry = {
  chainId: number;
  domainName: string;
  verifyingContract: string;
  primaryType: string;
};

export type PolicyV1 = {
  profile: string;
  rules: {
    allowedContracts: string[];
    blockAuthorityChanges: boolean;
    blockOnBinanceRisk: boolean;
    blockSetApprovalForAll: boolean;
    blockUnlimitedApprove: boolean;
    deniedSelectors: string[];
    eip712: { allow: Eip712AllowEntry[]; deny?: string[]; mode: "allowlist" | "denylist" };
    maxNativeValueWei: string;
    oneStep: { allow: string[] };
    unknownCommand: "block";
  };
  v: 1;
};
