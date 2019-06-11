pragma solidity >= 0.5.0 <0.6.0;


import "./Ownable.sol";
import "./SafeMath.sol";

contract Remittance is Ownable {
  using SafeMath for uint256;

  struct LockedBalances {
    address owner;
    address exchange;
    uint256 balance;
    uint256 deadline;
  }

  mapping(bytes32 => LockedBalances) lockedBalances;
  mapping(address => uint256) balances;
  uint256 fee;
  bool dead = false;

  constructor(uint256 amount) public {
    fee = amount;
  }

  event LogLockBalance(
    address indexed sender,
    bytes32 indexed passwordHash,
    uint256 balance,
    uint256 deadline
  );

  event LogClaimBack(
    address indexed sender,
    bytes32 indexed passwordHash,
    uint256 balance
  );

  event LogChallengeLock(
    address indexed sender,
    bytes32 indexed passwordHash,
    uint256 balance
  );

  modifier mustBeAlive(){
    require(dead == false, "The contract is no longer available");
    _;
  }

  function lockBalance(bytes32 passwordHash, uint256 deadline, address exchange) public payable mustBeAlive() {
    require(exchange != address(0), "Exchange must be non-zero address");
    require(msg.value > fee, "Transferred value must be greater than the fee");
    require(lockedBalances[passwordHash].owner != address(0), "Password has been used");
    require(block.timestamp < deadline, "Deadline is in the past");
    require(deadline < block.timestamp + 1 days, "Deadline is too big. Max: 1 day");

    lockedBalances[passwordHash] = LockedBalances({
      owner: msg.sender,
      exchange: exchange,
      balance: msg.value,
      deadline: deadline
    });

    emit LogLockBalance(msg.sender, passwordHash, msg.value, deadline);
  }

  function challengeLock(bytes32 word1, bytes32 word2) public {
    bytes32 passwordHash = generatePassword(word1, word2);
    require(lockedBalances[passwordHash].exchange == msg.sender, "The ether can be claimed only from the exchange address");
    require(lockedBalances[passwordHash].balance > 0, "This lock has not ether");
    uint256 balance = lockedBalances[passwordHash].balance;
    lockedBalances[passwordHash].balance = 0;
    balances[msg.sender] = balances[msg.sender].add(balance);
    emit LogChallengeLock(msg.sender, passwordHash, balance);
  }

  function claimBack(bytes32 passwordHash) public {
    require(lockedBalances[passwordHash].owner == msg.sender, "You must be the owner of the lock");
    require(lockedBalances[passwordHash].balance > 0, "This lock has not ether");
    require(lockedBalances[passwordHash].deadline < now, "Deadline has not passed yet");

    uint256 balance = lockedBalances[passwordHash].balance;
    lockedBalances[passwordHash].balance = 0;

    emit LogClaimBack(msg.sender, passwordHash, balance);

    msg.sender.transfer(balance);
  }

  function withdraw() public {
    require(balances[msg.sender] > 0, "This address has no ether");
    uint256 balance = balances[msg.sender];
    balances[msg.sender] = 0;
    msg.sender.transfer(balance);
  }

  function kill() public onlyOwner() {
    dead = true;
  }

  function generatePassword(bytes32 word1, bytes32 word2) public pure returns (bytes32){
    return keccak256(abi.encode(word1, word2));
  }

  function() external {
    revert();
  }


}
