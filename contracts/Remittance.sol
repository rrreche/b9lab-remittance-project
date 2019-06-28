pragma solidity >= 0.5.0 <0.6.0;


import "./Pausable.sol";
import "./SafeMath.sol";

contract Remittance is Pausable {
  using SafeMath for uint256;

  struct LockedBalances {
    address sender;
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

  uint256 constant oneMonthInSeconds = 30 days;

  mapping(bytes32 => LockedBalances) public lockedBalances;
  uint256 public fee;
  mapping(address => uint256) public collectedFees;
  bool public dead;

  constructor(uint256 mFee, bool startPaused) Pausable(startPaused) public {
    fee = mFee;
  }

  function lockBalance(bytes32 passwordHash, uint256 deadline) public payable mustBeRunning mustBeAlive returns (bool) {
    uint256 mFee = fee;

    require(msg.value > mFee, "Transferred value must be greater than the fee");
    require(lockedBalances[passwordHash].sender == address(0), "Password has been used");
    require(block.timestamp < deadline, "Deadline is in the past");
    require(deadline < block.timestamp.add(oneMonthInSeconds), "Deadline is too big. Max: 30 days");

    lockedBalances[passwordHash] = LockedBalances({
      sender: msg.sender,
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
    require(balance > 0, "This lock has not ether");
    lockedBalances[passwordHash].balance = 0;
    lockedBalances[passwordHash].deadline = 0;
    emit LogLockChallenged(msg.sender, passwordHash);
    msg.sender.transfer(balance);
    return true;
  }

  function claimBack(bytes32 passwordHash) public returns (bool) {
    uint256 balance = lockedBalances[passwordHash].balance;

    require(balance > 0, "This lock has not ether");
    require(lockedBalances[passwordHash].sender == msg.sender, "You must be the sender of the lock");
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

  function generatePassword(bytes32 plainTextPassword, address exchange) public view returns (bytes32) {
    require(exchange != address(0), "Exchange must be non-zero address");
    return keccak256(abi.encodePacked(address(this), plainTextPassword, exchange));
  }

  function() external {
    revert();
  }


}
