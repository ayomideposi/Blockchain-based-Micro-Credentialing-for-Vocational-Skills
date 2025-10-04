import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_USER_ID = 101;
const ERR_INVALID_SKILL_ID = 102;
const ERR_INVALID_PROOF_HASH = 103;
const ERR_INVALID_EXPIRATION = 104;
const ERR_INVALID_METADATA = 105;
const ERR_CREDENTIAL_ALREADY_EXISTS = 106;
const ERR_CREDENTIAL_NOT_FOUND = 107;
const ERR_AUTHORITY_NOT_VERIFIED = 109;
const ERR_MAX_CREDENTIALS_EXCEEDED = 114;
const ERR_INVALID_CREDENTIAL_TYPE = 115;
const ERR_INVALID_LEVEL = 116;
const ERR_INVALID_LOCATION = 118;
const ERR_INVALID_CURRENCY = 119;
const ERR_INVALID_UPDATE_PARAM = 113;

interface Credential {
  userId: number;
  skillId: number;
  proofHash: Uint8Array;
  issuanceTimestamp: number;
  expiration: number | null;
  metadata: string;
  issuer: string;
  credentialType: string;
  level: number;
  prerequisites: number[];
  location: string;
  currency: string;
  status: boolean;
  endorsers: string[];
}

interface CredentialUpdate {
  updateMetadata: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class CredentialIssuerMock {
  state: {
    nextCredentialId: number;
    maxCredentials: number;
    issuanceFee: number;
    authorityContract: string | null;
    transferFee: number;
    credentials: Map<number, Credential>;
    credentialsByUser: Map<number, number[]>;
    credentialsBySkill: Map<number, number[]>;
    credentialUpdates: Map<number, CredentialUpdate>;
  } = {
    nextCredentialId: 0,
    maxCredentials: 10000,
    issuanceFee: 500,
    authorityContract: null,
    transferFee: 100,
    credentials: new Map(),
    credentialsByUser: new Map(),
    credentialsBySkill: new Map(),
    credentialUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextCredentialId: 0,
      maxCredentials: 10000,
      issuanceFee: 500,
      authorityContract: null,
      transferFee: 100,
      credentials: new Map(),
      credentialsByUser: new Map(),
      credentialsBySkill: new Map(),
      credentialUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  isVerifiedAuthority(principal: string): Result<boolean> {
    return { ok: true, value: this.authorities.has(principal) };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setIssuanceFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.issuanceFee = newFee;
    return { ok: true, value: true };
  }

  issueCredential(
    userId: number,
    skillId: number,
    proofHash: Uint8Array,
    expiration: number | null,
    metadata: string,
    credentialType: string,
    level: number,
    prerequisites: number[],
    location: string,
    currency: string,
    endorsers: string[]
  ): Result<number> {
    if (this.state.nextCredentialId >= this.state.maxCredentials) return { ok: false, value: ERR_MAX_CREDENTIALS_EXCEEDED };
    if (userId <= 0) return { ok: false, value: ERR_INVALID_USER_ID };
    if (skillId <= 0) return { ok: false, value: ERR_INVALID_SKILL_ID };
    if (proofHash.length !== 32) return { ok: false, value: ERR_INVALID_PROOF_HASH };
    if (expiration !== null && expiration <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRATION };
    if (metadata.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    if (!["vocational", "skill", "certification"].includes(credentialType)) return { ok: false, value: ERR_INVALID_CREDENTIAL_TYPE };
    if (level < 1 || level > 5) return { ok: false, value: ERR_INVALID_LEVEL };
    if (location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "USD"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (!this.isVerifiedAuthority(this.caller).value) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.credentialsByUser.has(userId) && (this.state.credentialsByUser.get(userId) || []).some((id: number) => this.state.credentials.get(id)?.skillId === skillId)) {
      return { ok: false, value: ERR_CREDENTIAL_ALREADY_EXISTS };
    }
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.issuanceFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextCredentialId;
    const credential: Credential = {
      userId,
      skillId,
      proofHash,
      issuanceTimestamp: this.blockHeight,
      expiration,
      metadata,
      issuer: this.caller,
      credentialType,
      level,
      prerequisites,
      location,
      currency,
      status: true,
      endorsers,
    };
    this.state.credentials.set(id, credential);
    const userCreds = this.state.credentialsByUser.get(userId) || [];
    this.state.credentialsByUser.set(userId, [...userCreds, id]);
    const skillCreds = this.state.credentialsBySkill.get(skillId) || [];
    this.state.credentialsBySkill.set(skillId, [...skillCreds, id]);
    this.state.nextCredentialId++;
    return { ok: true, value: id };
  }

  getCredential(id: number): Credential | null {
    return this.state.credentials.get(id) || null;
  }

  updateCredential(id: number, updateMetadata: string): Result<boolean> {
    const cred = this.state.credentials.get(id);
    if (!cred) return { ok: false, value: false };
    if (cred.issuer !== this.caller) return { ok: false, value: false };
    if (updateMetadata.length > 256) return { ok: false, value: false };

    const updated: Credential = { ...cred, metadata: updateMetadata };
    this.state.credentials.set(id, updated);
    this.state.credentialUpdates.set(id, {
      updateMetadata,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getCredentialCount(): Result<number> {
    return { ok: true, value: this.state.nextCredentialId };
  }

  checkCredentialExistence(userId: number, skillId: number): Result<boolean> {
    const userCreds = this.state.credentialsByUser.get(userId) || [];
    const exists = userCreds.some((id: number) => this.state.credentials.get(id)?.skillId === skillId);
    return { ok: true, value: exists };
  }
}

describe("CredentialIssuer", () => {
  let contract: CredentialIssuerMock;

  beforeEach(() => {
    contract = new CredentialIssuerMock();
    contract.reset();
  });

  it("issues a credential successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    const result = contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "Basic Plumbing",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const cred = contract.getCredential(0);
    expect(cred?.userId).toBe(1);
    expect(cred?.skillId).toBe(1);
    expect(cred?.metadata).toBe("Basic Plumbing");
    expect(cred?.credentialType).toBe("vocational");
    expect(cred?.level).toBe(2);
    expect(cred?.location).toBe("Online");
    expect(cred?.currency).toBe("STX");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate credential for user and skill", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "Basic Plumbing",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    const result = contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "Advanced Plumbing",
      "skill",
      3,
      [1],
      "Workshop",
      "USD",
      ["ST3ENDORSE"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CREDENTIAL_ALREADY_EXISTS);
  });

  it("rejects non-authorized caller", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2FAKE";
    contract.authorities = new Set();
    const proofHash = new Uint8Array(32).fill(0);
    const result = contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "Basic Plumbing",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects credential issuance without authority contract", () => {
    const proofHash = new Uint8Array(32).fill(0);
    const result = contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "NoAuth",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid user id", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    const result = contract.issueCredential(
      0,
      1,
      proofHash,
      null,
      "InvalidUser",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_USER_ID);
  });

  it("rejects invalid skill id", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    const result = contract.issueCredential(
      1,
      0,
      proofHash,
      null,
      "InvalidSkill",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SKILL_ID);
  });

  it("rejects invalid credential type", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    const result = contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "InvalidType",
      "invalid",
      2,
      [],
      "Online",
      "STX",
      []
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CREDENTIAL_TYPE);
  });

  it("updates a credential successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "OldMetadata",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    const result = contract.updateCredential(0, "NewMetadata");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const cred = contract.getCredential(0);
    expect(cred?.metadata).toBe("NewMetadata");
    const update = contract.state.credentialUpdates.get(0);
    expect(update?.updateMetadata).toBe("NewMetadata");
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent credential", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateCredential(99, "NewMetadata");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-issuer", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "TestMetadata",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateCredential(0, "NewMetadata");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets issuance fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setIssuanceFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.issuanceFee).toBe(1000);
    const proofHash = new Uint8Array(32).fill(0);
    contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "TestMetadata",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects issuance fee change without authority contract", () => {
    const result = contract.setIssuanceFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct credential count", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "Cred1",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    contract.issueCredential(
      2,
      2,
      proofHash,
      100,
      "Cred2",
      "skill",
      3,
      [1],
      "Workshop",
      "USD",
      ["ST3ENDORSE"]
    );
    const result = contract.getCredentialCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks credential existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "TestCred",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    const result = contract.checkCredentialExistence(1, 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkCredentialExistence(1, 2);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects credential issuance with invalid metadata length", () => {
    contract.setAuthorityContract("ST2TEST");
    const proofHash = new Uint8Array(32).fill(0);
    const longMetadata = "a".repeat(257);
    const result = contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      longMetadata,
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_METADATA);
  });

  it("rejects credential issuance with max credentials exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxCredentials = 1;
    const proofHash = new Uint8Array(32).fill(0);
    contract.issueCredential(
      1,
      1,
      proofHash,
      null,
      "Cred1",
      "vocational",
      2,
      [],
      "Online",
      "STX",
      []
    );
    const result = contract.issueCredential(
      2,
      2,
      proofHash,
      100,
      "Cred2",
      "skill",
      3,
      [1],
      "Workshop",
      "USD",
      ["ST3ENDORSE"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CREDENTIALS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});