const Remittance = artifacts.require("./Remittance.sol");
const utils = require("web3-utils");
const BN = utils.BN;
const checkEvent = require("./helpers/checkEvent");

contract("Remittance", accounts => {
  this.fee = new BN("1");

  function generatePassword() {
    console.log("Generate password");
  }

  before("define Alice, Bob and Carol", () => {
    this.Alice = accounts[0];
    this.Bob = accounts[1];
    this.Carol = accounts[2];
    this.Mallory = accounts[3];
  });

  beforeEach("initialize contract", async () => {
    this.contract = await Remittance.new(this.fee, { from: this.Alice });
  });

  describe("Contract initialization", () => {
    it("assigns the owner correctly", async () => {
      const owner = await this.contract.getOwner();
      assert.equal(owner, this.Alice);
    });

    describe("fees", () => {
      it("should send the owner a cut smaller than deployment costs");
    });
  });

  describe("Kill", () => {
    beforeEach("kill", async () => {
      console.log("Kill");
    });
    it("allows to kill the contract");
    describe("When killed", () => {
      it("updates state and registers event");
      it("rejects further locking");
    });
  });

  describe("generatePassword()", () => {
    it("should generate the equal hash from same inputs");
  });

  describe("lockBalance()", () => {
    it("allows to lock ether under a password");

    it("rejects repeating password");

    it("rejects setting a deadline in the past");

    it("rejects setting a deadline further than 1 day");
  });

  describe("challengeLock()", () => {
    beforeEach("Lock some ether", async () => {
      console.log("lock");
    });

    it("should update balance if the correect password is input from the exchange address");

    it("should reject if the sender is not the exchange address");

    it("should reject if the password is not correct");
  });

  describe("claimBack()", () => {
    beforeEach("Lock some ether", async () => {});

    it("allows to claim back the ether if deadline has passed");
    it("should rejects call from non-owner");
    it("should reject if the lock has no ether");
    it("should reject before deadline has passed");
  });

  describe("withdraw()", () => {
    it("should allow to withdraw if balances are assigned");
    it("should reject if no balance is assigned");
  });
});
