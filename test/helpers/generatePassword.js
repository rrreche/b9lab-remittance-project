const { soliditySha3, asciiToHex } = require("web3-utils");

function generatePassword(contractAddress, plainTextPassword) {
  return soliditySha3({ t: "address", v: contractAddress }, { t: "bytes32", v: asciiToHex(plainTextPassword, 32) });
}

module.exports = generatePassword;
