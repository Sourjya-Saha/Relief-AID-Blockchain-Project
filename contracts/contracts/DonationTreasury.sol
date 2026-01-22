// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./ReliefUSD.sol";

contract DonationTreasury is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    ReliefUSD public token;

    // ✅ ReliefManager address (auto mint goes here)
    address public reliefManager;

    // 1 POL = 1000 RUSD
    uint256 public polToRusdRate = 1000;

    uint256 public totalDonatedPOL;
    uint256 public totalRedeemedPOL;
    uint256 public totalRedeemedRUSD;

    enum RedemptionStatus { PENDING, FULFILLED, REJECTED }

    struct OffchainRedemptionRequest {
        address merchant;
        uint256 rusdAmount;
        string requestCID;
        string fulfillmentCID;
        uint256 timestamp;
        RedemptionStatus status;
    }

    OffchainRedemptionRequest[] public redemptionRequests;

    // EVENTS
    event Donated(address indexed donor, uint256 polAmount, uint256 rusdMinted, uint256 timestamp);
    event ReliefManagerSet(address indexed manager, uint256 timestamp);
    event Withdrawn(address indexed recipient, uint256 amount, uint256 timestamp);
    event RateUpdated(uint256 rate, uint256 timestamp);

    event RedeemedOnChain(address indexed merchant, uint256 rusdAmount, uint256 polAmount, uint256 timestamp);

    event OffchainRedemptionRequested(
        uint256 indexed requestId,
        address indexed merchant,
        uint256 rusdAmount,
        string requestCID,
        uint256 timestamp
    );

    event OffchainRedemptionStatusUpdated(
        uint256 indexed requestId,
        RedemptionStatus status,
        string fulfillmentCID,
        uint256 timestamp
    );

    constructor(address _tokenAddress) {
        require(_tokenAddress != address(0), "Invalid token");
        token = ReliefUSD(_tokenAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ✅ ADMIN SETTER
    function setReliefManager(address _manager) external onlyRole(ADMIN_ROLE) {
        require(_manager != address(0), "Invalid manager");
        reliefManager = _manager;
        emit ReliefManagerSet(_manager, block.timestamp);
    }

    // ✅ DONATIONS
    function donate() external payable {
        _processDonation(msg.sender, msg.value);
    }

    receive() external payable {
        _processDonation(msg.sender, msg.value);
    }

    function _processDonation(address donor, uint256 amountPOL) internal {
        require(amountPOL > 0, "Donation must be > 0");
        require(reliefManager != address(0), "ReliefManager not set");

        totalDonatedPOL += amountPOL;

        // ✅ mint RUSD to ReliefManager
        uint256 rusdAmount = amountPOL * polToRusdRate;
        token.mint(reliefManager, rusdAmount);

        emit Donated(donor, amountPOL, rusdAmount, block.timestamp);
    }

    function withdrawPOL(address payable recipient, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(recipient != address(0), "Invalid recipient");
        require(amount <= address(this).balance, "Insufficient treasury");

        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "Withdraw failed");

        emit Withdrawn(recipient, amount, block.timestamp);
    }

    // RATE
    function setPolToRusdRate(uint256 _rate) external onlyRole(ADMIN_ROLE) {
        require(_rate > 0, "Invalid rate");
        polToRusdRate = _rate;
        emit RateUpdated(_rate, block.timestamp);
    }

    // ON-CHAIN REDEMPTION
    function redeemOnChain(uint256 rusdAmount) external {
        require(rusdAmount > 0, "Invalid amount");
        require(token.balanceOf(msg.sender) >= rusdAmount, "Insufficient RUSD");

        uint256 polAmount = rusdAmount / polToRusdRate;
        require(polAmount > 0, "Amount too small");
        require(address(this).balance >= polAmount, "Treasury insufficient POL");

        token.managerTransfer(msg.sender, address(this), rusdAmount);
        token.burn(rusdAmount);

        totalRedeemedRUSD += rusdAmount;
        totalRedeemedPOL += polAmount;

        (bool ok,) = payable(msg.sender).call{value: polAmount}("");
        require(ok, "POL payout failed");

        emit RedeemedOnChain(msg.sender, rusdAmount, polAmount, block.timestamp);
    }

    // OFF-CHAIN REDEMPTION
    function requestOffchainRedemption(uint256 rusdAmount, string calldata requestCID)
        external
        returns (uint256)
    {
        require(rusdAmount > 0, "Invalid amount");
        require(bytes(requestCID).length > 0, "requestCID required");
        require(token.balanceOf(msg.sender) >= rusdAmount, "Insufficient RUSD");

        redemptionRequests.push(
            OffchainRedemptionRequest({
                merchant: msg.sender,
                rusdAmount: rusdAmount,
                requestCID: requestCID,
                fulfillmentCID: "",
                timestamp: block.timestamp,
                status: RedemptionStatus.PENDING
            })
        );

        uint256 id = redemptionRequests.length - 1;

        emit OffchainRedemptionRequested(id, msg.sender, rusdAmount, requestCID, block.timestamp);

        return id;
    }

    function fulfillOffchainRedemption(uint256 requestId, string calldata fulfillmentCID)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(requestId < redemptionRequests.length, "Invalid request");

        OffchainRedemptionRequest storage r = redemptionRequests[requestId];
        require(r.status == RedemptionStatus.PENDING, "Not pending");

        token.managerTransfer(r.merchant, address(this), r.rusdAmount);
        token.burn(r.rusdAmount);

        r.fulfillmentCID = fulfillmentCID;
        r.status = RedemptionStatus.FULFILLED;

        emit OffchainRedemptionStatusUpdated(requestId, RedemptionStatus.FULFILLED, fulfillmentCID, block.timestamp);
    }

    function rejectOffchainRedemption(uint256 requestId, string calldata fulfillmentCID)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(requestId < redemptionRequests.length, "Invalid request");

        OffchainRedemptionRequest storage r = redemptionRequests[requestId];
        require(r.status == RedemptionStatus.PENDING, "Not pending");

        r.fulfillmentCID = fulfillmentCID;
        r.status = RedemptionStatus.REJECTED;

        emit OffchainRedemptionStatusUpdated(requestId, RedemptionStatus.REJECTED, fulfillmentCID, block.timestamp);
    }

    // VIEWS
    function getTotalRequests() external view returns (uint256) {
        return redemptionRequests.length;
    }

    function treasuryBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
