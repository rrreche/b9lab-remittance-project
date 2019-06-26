const { soliditySha3, asciiToHex } = require("web3-utils");

function generatePassword(contractAddress, plainTextPassword, senderAddress) {
  return soliditySha3(
    { t: "address", v: contractAddress },
    { t: "bytes32", v: asciiToHex(plainTextPassword, 32) },
    { t: "address", v: senderAddress }
  );
}

module.exports = generatePassword;
