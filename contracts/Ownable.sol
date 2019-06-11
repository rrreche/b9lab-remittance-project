pragma solidity >= 0.5.0 <6.0.0;


contract Ownable {

  address private owner;

  constructor() public {
    owner = msg.sender;
  }

  modifier onlyOwner(){
    require(msg.sender == owner, "Can only be called by the owner");
    _;
  }

  event LogOwnerChange(
    address indexed sender,
    address indexed owner
  );

  function getOwner() public view returns(address){
    return owner;
  }

  function setOwner(address newOwner) public onlyOwner(){
    require(newOwner != address(0), "newOwner is empty");
    owner = newOwner;
    emit LogOwnerChange(msg.sender, owner);
  }

}
