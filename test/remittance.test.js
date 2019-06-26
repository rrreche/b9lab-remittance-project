const Remittance = artifacts.require("./Remittance.sol");
const { BN, toWei, asciiToHex } = require("web3-utils");
const moment = require("moment");
const checkEvent = require("./helpers/checkEvent");
const generatePassword = require("./helpers/generatePassword");

contract("Remittance", accounts => {
  let alice, bob, carol, david;
  let contract;
  let hashedPassword;
  let deadline;

  const fee = new BN("1");
  const plainTextPassword = "123456";
  const remittedValue = new BN(toWei("1", "shannon"));

  before("define Alice, Bob and Carol", function() {
    [alice, bob, carol, david] = accounts;
    // Alice: contract owner
    // Bob: offchain user, does not have participation in tests
    // Carol: exchange
    // David: dishonest user
  });

  beforeEach("initialize contract", async function() {
    contract = await Remittance.new(fee, { from: alice });
    hashedPassword = generatePassword(contract.address, plainTextPassword, carol);
  });

  describe("generatePassword()", () => {
    it("should generate an equal hash from same inputs", async function() {
      const contractGeneratedPassword = await contract.generatePassword(asciiToHex(plainTextPassword, 32), carol, {
        from: alice
      });
      const helperGeneratedPassword = generatePassword(contract.address, plainTextPassword, carol);

      assert.strictEqual(
        contractGeneratedPassword,
        helperGeneratedPassword,
        "Password and helper do not generate the same password hash"
      );
    });
  });

  describe("Contract initialization", () => {
    it("assigns the owner and fee correctly", async function() {
      const owner = await contract.getOwner();
      assert.strictEqual(owner, alice, "Owner was not assigned correctly");

      const mFee = await contract.fee();
      assert.strictEqual(mFee.toString(), fee.toString(), "Fee was not assigned correctly");
    });
  });

  describe("Contract operation", () => {
    describe("lockBalance()", () => {
      it("allows to lock ether under a password and collects fees", async function() {
        const deadline = moment(Date.now())
          .add(12, "hours")
          .unix();

        const tx = await contract.lockBalance(hashedPassword, deadline, carol, {
          from: alice,
          value: remittedValue.toString()
        });

        // Locked balance entry:
        const lockedBalance = await contract.lockedBalances(hashedPassword);

        assert.strictEqual(lockedBalance.owner, alice, "Owner of lock was incorrectly assigned");
        assert.strictEqual(lockedBalance.balance.toString(), remittedValue.sub(fee).toString(), "Unexpected balances");
        assert.strictEqual(lockedBalance.deadline.toString(), deadline.toString(), "Unexpected deadline");

        // Balance of the smart contract:
        assert.strictEqual(
          (await web3.eth.getBalance(contract.address)).toString(),
          remittedValue.toString(),
          "Contract ether balance mismatch"
        );

        // Collected fee:
        assert.strictEqual((await contract.collectedFees(alice)).toString(), fee.toString(), "Collected fee mismatch");

        // Events triggered:
        assert.strictEqual(tx.logs.length, 1);

        checkEvent({
          logs: tx.logs,
          name: "LogBalanceLocked",
          params: [
            { name: "sender", val: alice },
            { name: "passwordHash", val: hashedPassword },
            { name: "balance", val: remittedValue.toString() },
            { name: "deadline", val: deadline.toString() }
          ]
        });
      });

      it("rejects repeating password", async function() {
        const deadline = moment(Date.now())
          .add(12, "hours")
          .unix();

        await contract.lockBalance(hashedPassword, deadline, carol, {
          from: alice,
          value: remittedValue.toString()
        });

        try {
          const tx = await contract.lockBalance(hashedPassword, deadline, carol, {
            from: alice,
            value: remittedValue.toString()
          });

          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(e.reason, "Password has been used", "Transaction failed for the wrong reasons");
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });

      it("rejects setting a deadline in the past", async function() {
        try {
          const deadline = moment(Date.now())
            .subtract(1, "seconds")
            .unix();

          const tx = await contract.lockBalance(hashedPassword, deadline, carol, {
            from: alice,
            value: remittedValue.toString()
          });

          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(e.reason, "Deadline is in the past", "Transaction failed for the wrong reasons");
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });

      it("rejects setting a deadline further than 1 day", async function() {
        try {
          const deadline = moment(Date.now())
            .add(1, "days")
            .unix();

          const tx = await contract.lockBalance(hashedPassword, deadline, carol, {
            from: alice,
            value: remittedValue.toString()
          });

          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(e.reason, "Deadline is too big. Max: 1 day", "Transaction failed for the wrong reasons");
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });

      it("rejects settings exchange address to 0x0", async function() {
        try {
          const deadline = moment(Date.now())
            .add(1, "days")
            .unix();

          const tx = await contract.lockBalance(
            hashedPassword,
            deadline,
            "0x0000000000000000000000000000000000000000",
            {
              from: alice,
              value: remittedValue.toString()
            }
          );

          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(
              e.reason,
              "Exchange must be non-zero address",
              "Transaction failed for the wrong reasons"
            );
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });
    });

    describe("challengeLock()", () => {
      beforeEach("Lock some ether and adjust clocks to EVM status", async () => {
        const blockNumber = await web3.eth.getBlockNumber();

        const timestamp = (await web3.eth.getBlock(blockNumber)).timestamp;

        const deadline = moment
          .unix(timestamp)
          .add(12, "hours")
          .unix();

        await contract.lockBalance(hashedPassword, deadline, carol, {
          from: alice,
          value: remittedValue.toString()
        });
      });

      it("should update balance if the correct password is input from the exchange address", async function() {
        const oldCarolBalance = new BN(await web3.eth.getBalance(carol));

        const result = await contract.challengeLock(asciiToHex(plainTextPassword), { from: carol });
        const transaction = await web3.eth.getTransaction(result.tx);
        const txFee = new BN(String(result.receipt.gasUsed * transaction.gasPrice));

        // Check contract state:
        assert.strictEqual(
          (await contract.lockedBalances(hashedPassword)).balance.toString(),
          "0",
          "Locked balance was not set to 0"
        );

        // Check challenger balances update:
        const newCarolBalance = new BN(await web3.eth.getBalance(carol));
        assert.strictEqual(
          newCarolBalance.toString(),
          oldCarolBalance
            .add(remittedValue)
            .sub(fee)
            .sub(txFee)
            .toString(),
          "Unexpected balance for the exchange address"
        );

        // Events triggered:
        assert.strictEqual(result.logs.length, 1);

        checkEvent({
          logs: result.logs,
          name: "LogLockChallenged",
          params: [{ name: "sender", val: carol }, { name: "passwordHash", val: hashedPassword }]
        });
      });

      it("should reject if the sender is not the exchange address", async function() {
        try {
          const tx = await contract.challengeLock(asciiToHex(plainTextPassword), { from: david });

          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(e.reason, "This lock has not ether", "Transaction failed for the wrong reasons");
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });

      it("rejects if the lock is empty - wrong password", async function() {
        try {
          const tx = await contract.challengeLock(asciiToHex("wrongPassword"), { from: carol });

          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(e.reason, "This lock has not ether", "Transaction failed for the wrong reasons");
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });

      it("rejects if the lock is empty - already challenged", async function() {
        try {
          await contract.challengeLock(asciiToHex(plainTextPassword), { from: carol });
          const tx = await contract.challengeLock(asciiToHex(plainTextPassword), { from: carol });

          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(e.reason, "This lock has not ether", "Transaction failed for the wrong reasons");
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });
    });

    describe("claimBack()", () => {
      beforeEach("Lock some ether and adjust clocks to EVM status", async () => {
        const blockNumber = await web3.eth.getBlockNumber();

        const timestamp = (await web3.eth.getBlock(blockNumber)).timestamp;

        const deadline = moment
          .unix(timestamp)
          .add(12, "hours")
          .unix();

        await contract.lockBalance(hashedPassword, deadline, carol, {
          from: alice,
          value: remittedValue.toString()
        });
      });

      describe("after the deadline", () => {
        beforeEach("advance clock 12 hours and 1 second", async () => {
          const delta = 12 * 3600 + 1; // advance clock 12 hours (in seconds) + 1 second

          await web3.currentProvider.send(
            { jsonrpc: "2.0", method: "evm_increaseTime", params: [delta], id: 123 },
            (err, result) => {
              if (err) {
                console.error(err);
                return;
              }
            }
          );
        });

        it("allows to claim back the ether if deadline has passed", async function() {
          const oldAliceBalance = new BN(await web3.eth.getBalance(alice));

          const result = await contract.claimBack(hashedPassword, { from: alice });
          const transaction = await web3.eth.getTransaction(result.tx);
          const txFee = new BN(String(result.receipt.gasUsed * transaction.gasPrice));

          const newAliceBalance = new BN(await web3.eth.getBalance(alice));

          assert.strictEqual(
            (await contract.lockedBalances(hashedPassword)).balance.toString(),
            "0",
            "Locked balance was not set to 0"
          );

          assert.strictEqual(
            newAliceBalance.toString(),
            oldAliceBalance
              .add(remittedValue)
              .sub(txFee)
              .sub(fee)
              .toString(),
            "Unexpected balance for the remitter address"
          );
        });

        it("should reject call from non-owner", async function() {
          try {
            await contract.claimBack(hashedPassword, { from: david });
            assert.fail("Transaction should have failed");
          } catch (e) {
            if (e.reason) {
              assert.strictEqual(
                e.reason,
                "You must be the owner of the lock",
                "Transaction failed for the wrong reasons"
              );
            } else {
              console.error(e);
              assert.fail("Transaction failed for the wrong reasons");
            }
          }
        });

        it("should reject if the lock has no ether", async function() {
          try {
            await contract.claimBack(hashedPassword, { from: alice });
            await contract.claimBack(hashedPassword, { from: alice });
            assert.fail("Transaction should have failed");
          } catch (e) {
            if (e.reason) {
              assert.strictEqual(e.reason, "This lock has not ether", "Transaction failed for the wrong reasons");
            } else {
              console.error(e);
              assert.fail("Transaction failed for the wrong reasons");
            }
          }
        });
      });

      describe("before the deadline", () => {
        it("should reject if deadline has not passed", async function() {
          try {
            await contract.claimBack(hashedPassword, { from: alice });
            assert.fail("Transaction should have failed");
          } catch (e) {
            if (e.reason) {
              assert.strictEqual(e.reason, "Deadline has not passed yet", "Transaction failed for the wrong reasons");
            } else {
              console.error(e);
              assert.fail("Transaction failed for the wrong reasons");
            }
          }
        });
      });
    });

    describe("collectFees()", () => {
      beforeEach("Lock some ether and adjust clocks to EVM status", async () => {
        const blockNumber = await web3.eth.getBlockNumber();

        const timestamp = (await web3.eth.getBlock(blockNumber)).timestamp;

        const deadline = moment
          .unix(timestamp)
          .add(12, "hours")
          .unix();

        await contract.lockBalance(hashedPassword, deadline, carol, {
          from: alice,
          value: remittedValue.toString()
        });
      });

      it("allows to withdraw collected fees and updates smart contract state", async function() {
        const oldAliceBalance = new BN(await web3.eth.getBalance(alice));

        const result = await contract.collectFees({ from: alice });
        const transaction = await web3.eth.getTransaction(result.tx);
        const txFee = new BN(String(result.receipt.gasUsed * transaction.gasPrice));

        const newAliceBalance = new BN(await web3.eth.getBalance(alice));

        assert.strictEqual(
          newAliceBalance.toString(),
          oldAliceBalance
            .add(fee)
            .sub(txFee)
            .toString(),
          "Unexpected balance for the owner address"
        );
        assert.strictEqual((await contract.collectedFees(alice)).toString(), "0", "collectedFees was not set to 0");
      });

      it("rejects call if collectedFees is 0", async function() {
        try {
          await contract.collectFees({ from: alice });
          await contract.collectFees({ from: alice });
          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(
              e.reason,
              "There are no collected fees at this moment",
              "Transaction failed for the wrong reasons"
            );
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });
    });
    describe("kill()", () => {
      it("updates state and registers event", async function() {
        const tx = await contract.kill({ from: alice });

        checkEvent({
          logs: tx.logs,
          name: "LogKilled",
          params: [{ name: "sender", val: alice }]
        });

        assert.isTrue(await contract.dead(), "Killed state was not recorded correctly");
      });

      it("rejects further locking", async function() {
        await contract.kill({ from: alice });

        try {
          const tx = await contract.lockBalance(asciiToHex(plainTextPassword), 0, carol, {
            from: alice,
            value: remittedValue.toString()
          });

          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(
              e.reason,
              "The contract is no longer available",
              "Transaction failed for the wrong reasons"
            );
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });

      it("rejects call if sender is not the owner", async function() {
        try {
          await contract.kill({ from: david });

          assert.fail("Transaction should have failed");
        } catch (e) {
          if (e.reason) {
            assert.strictEqual(e.reason, "Can only be called by the owner", "Transaction failed for the wrong reasons");
          } else {
            console.error(e);
            assert.fail("Transaction failed for the wrong reasons");
          }
        }
      });
    });
  });
});
