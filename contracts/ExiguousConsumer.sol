//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

import "https://github.com/smartcontractkit/chainlink/contracts/src/v0.6/ChainlinkClient.sol";
import "https://github.com/smartcontractkit/chainlink/contracts/src/v0.6/vendor/Ownable.sol";

   
contract ExiguousConsumer is ChainlinkClient, Ownable {

    //CONFIG: Network
    /***********************************************************************************/
   
    uint256 private constant ORACLE_PAYMENT = 1 * 10**9;

    function setJob(string memory _jobId) 
    public onlyOwner 
    { 
        oracle_jobid = _jobId;
    }

    function setOracle(address _oracle) 
    public onlyOwner 
    { 
        oracle_address = _oracle; 
    }
    
    uint256 public CONTRACT_NETWORK = 4;
    address public oracle_address = 0x00000000000000000000000000000000;
    string public oracle_jobid = "0000000001";
    string public dataObjectString;
    bytes32 public dataObjectBytes32;
    
 
    //MAIN: Constructor
    /**********************************************************************************/

    constructor() public Ownable() {
        setPublicChainlinkToken();
    }
    

    //ACCOUNTING: Balance / Withdrawal
    /**********************************************************************************/

    function getBalance() public onlyOwner view returns(uint256) {
        return address(this).balance;
    }

    function withdrawAll() public onlyOwner {
        address payable to = payable(msg.sender);
        to.transfer(getBalance());
    }

    function withdrawAmount(uint256 amount) public onlyOwner {
        address payable to = payable(msg.sender);
        to.transfer(amount);
    }

    function withdrawLink() public onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(chainlinkTokenAddress());
        require(
            link.transfer(msg.sender, link.balanceOf(address(this))),
            "Unable to transfer"
        );
    
    }
    
    function addToBalance() public payable {}
    

    //CHAINLINK: Requests
    /*********************************************************************************/

    function requestDataString(string memory _spec, string memory _id1, string memory _id2, string memory _id3, string memory _id4, string memory _id5, string memory _id6) 
    public onlyOwner 
    {

        Chainlink.Request memory req = buildChainlinkRequest(stringToBytes32(oracle_jobid), address(this), this.fulfillDataRequestString.selector );
        
        req.add("spec", _spec);
        req.add("id1", _id1);
        req.add("id2", _id2);
        req.add("id3", _id3);
        req.add("id4", _id4);
        req.add("id5", _id5);
        req.add("id6", _id6);

        sendChainlinkRequestTo(oracle_address, req, ORACLE_PAYMENT);
    }

    function requestDataBytes32(string memory _spec, string memory _id1, string memory _id2, string memory _id3, string memory _id4, string memory _id5, string memory _id6) 
    public onlyOwner 
    {

        Chainlink.Request memory req = buildChainlinkRequest(stringToBytes32(oracle_jobid), address(this), this.fulfillDataRequestBytes32.selector );
        
        req.add("spec", _spec);
        req.add("id1", _id1);
        req.add("id2", _id2);
        req.add("id3", _id3);
        req.add("id4", _id4);
        req.add("id5", _id5);
        req.add("id6", _id6);

        sendChainlinkRequestTo(oracle_address, req, ORACLE_PAYMENT);
    }
    
    //CHAINLINK: Settlement
    /*********************************************************************************/
    
    function fulfillDataRequestString(bytes32 _requestId, bytes32 _data) 
    public recordChainlinkFulfillment(_requestId)
    {
        dataObjectString = bytes32ToStr(_data);
    }

    function fulfillDataRequestBytes32(bytes32 _requestId, bytes32 _data) 
    public recordChainlinkFulfillment(_requestId)
    {
        dataObjectBytes32 = _data;
        
        // (uint256 _s1, uint256 _s2, uint256 _s3, uint256 _s4) = splitBytes32(dataObjectBytes32);
        // Do stuff with the 4 separate (uint256)bytes8
    }

    //UTILS
    /*********************************************************************************/

    function getChainlinkToken() 
    public view returns (address) 
    {
        return chainlinkTokenAddress();
    }

    function bytes32ToStr(bytes32 _bytes32) 
    private pure returns (string memory) 
    {
        bytes memory bytesArray = new bytes(32);
        for (uint256 i; i < 32; i++) {
            bytesArray[i] = _bytes32[i];
        }
        return string(bytesArray);
    }
    
    function stringToBytes32(string memory source) 
    private pure returns (bytes32 result) 
    {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        assembly {
            // solhint-disable-line no-inline-assembly
            result := mload(add(source, 32))
        }
    
    }

    function splitBytes32(bytes32 r) 
    private pure returns (uint256 s1, uint256 s2, uint256 s3, uint256 s4)
    {
        uint256 rr = uint256(r);
        s1 = uint256(uint64(rr >> (64 * 3)));
        s2 = uint256(uint64(rr >> (64 * 2)));
        s3 = uint256(uint64(rr >> (64 * 1)));
        s4 = uint256(uint64(rr >> (64 * 0)));
    
    }

}
