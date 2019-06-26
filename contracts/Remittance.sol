pragma solidity >= 0.5.0 <0.6.0;


import "./Ownable.sol";
import "./SafeMath.sol";

contract Remittance is Ownable {
  using SafeMath for uint256;

  struct LockedBalances {
    address owner;
    uint256 balance;
    uint256 deadline;
  }

  event LogBalanceLocked(
    address indexed sender,
    bytes32 indexed passwordHash,
    uint256 balance,
    uint256 deadline
  );

  event LogBalanceClaimedBack(
    address indexed sender,
    bytes32 indexed passwordHash
  );

  event LogLockChallenged(
    address indexed sender,
    bytes32 indexed passwordHash
  );

  event LogFeesCollected(
    address indexed sender,
    uint256 collectedFees
  );

  event LogKilled(
    address indexed sender
  );

  uint256 constant oneDayInSeconds = 1 days;

  mapping(bytes32 => LockedBalances) public lockedBalances;
  uint256 public fee;
  mapping(address => uint256) public collectedFees;
  bool public dead = false;

  constructor(uint256 mFee) public {
    fee = mFee;
  }

  modifier mustBeAlive {
    require(!dead, "The contract is no longer available");
    _;
  }

  function lockBalance(bytes32 passwordHash, uint256 deadline, address exchange) public payable mustBeAlive returns (bool) {
    require(exchange != address(0), "Exchange must be non-zero address");

    uint256 mFee = fee;

    require(msg.value > mFee, "Transferred value must be greater than the fee");
    require(lockedBalances[passwordHash].owner == address(0), "Password has been used");
    require(block.timestamp < deadline, "Deadline is in the past");
    require(deadline < block.timestamp.add(oneDayInSeconds), "Deadline is too big. Max: 1 day");

    lockedBalances[passwordHash] = LockedBalances({
      owner: msg.sender,
      balance: msg.value.sub(mFee),
      deadline: deadline
    });

    address currentOwner = getOwner();
    collectedFees[currentOwner] = collectedFees[currentOwner].add(mFee);
    emit LogBalanceLocked(msg.sender, passwordHash, msg.value, deadline); // Might change msg.value for msg.value.sub(mFee)...?

    return true;
  }

  function challengeLock(bytes32 plainTextPassword) public returns (bool) {

    bytes32 passwordHash = generatePassword(plainTextPassword, msg.sender);
    uint256 balance = lockedBalances[passwordHash].balance;
    require(lockedBalances[passwordHash].balance > 0, "This lock has not ether");
    lockedBalances[passwordHash].balance = 0;
    lockedBalances[passwordHash].deadline = 0;
    emit LogLockChallenged(msg.sender, passwordHash);
    msg.sender.transfer(balance);
    return true;
  }

  function claimBack(bytes32 passwordHash) public returns (bool) {
    uint256 balance = lockedBalances[passwordHash].balance;

    require(balance > 0, "This lock has not ether");
    require(lockedBalances[passwordHash].owner == msg.sender, "You must be the owner of the lock");
    require(lockedBalances[passwordHash].deadline < now, "Deadline has not passed yet");

    lockedBalances[passwordHash].balance = 0;
    lockedBalances[passwordHash].deadline = 0;
    emit LogBalanceClaimedBack(msg.sender, passwordHash);

    msg.sender.transfer(balance);
    return true;
  }

  function collectFees() public returns (bool) {
    uint256 recollection = collectedFees[msg.sender];
    require(recollection > 0, "There are no collected fees at this moment");
    collectedFees[msg.sender] = 0;
    emit LogFeesCollected(msg.sender, recollection);
    msg.sender.transfer(recollection);
    return true;
  }

  function kill() public onlyOwner {
    emit LogKilled(msg.sender);
    dead = true;
  }

  function generatePassword(bytes32 plainTextPassword, address exchange) public view returns (bytes32) {
    return keccak256(abi.encodePacked(address(this), plainTextPassword, exchange));
  }

  function() external {
    revert();
  }


}
