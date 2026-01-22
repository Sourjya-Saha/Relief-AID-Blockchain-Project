// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./ReliefUSD.sol";

/**
 * @dev Minimal interface for Treasury contract
 * Needed only for donation-backed minting cap.
 */
interface IDonationTreasury {
    function totalDonatedPOL() external view returns (uint256);
}

/**
 * @title ReliefManager
 * @dev Main controller for emergency relief distribution system
 * ✅ NO duplicates ever
 * ✅ Correct active vs total registered stats
 * ✅ Correct totalDistributed / totalSpent all-time (even if revoked)
 * ✅ Donation-backed minting (Treasury)
 * ✅ No approvals needed (managerTransfer)
 */
contract ReliefManager is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant BENEFICIARY_ROLE = keccak256("BENEFICIARY_ROLE");
    bytes32 public constant MERCHANT_ROLE = keccak256("MERCHANT_ROLE");

    ReliefUSD public token;

    // ✅ Treasury contract reference (donations are stored there)
    address public treasury;

    // ✅ Conversion policy: 1 POL = 1000 RUSD
    // (RUSD 18 decimals, POL 18 decimals)
    uint256 public polToRusdRate = 1000;

    // ✅ Tracks how much RUSD has been minted via this manager (backed mint)
    uint256 public totalMintedRUSD;

    enum Category {
        FOOD,
        MEDICAL,
        SHELTER
    }

    // ------------------- STRUCTS -------------------

    struct Merchant {
        bool isRegistered; // active flag
        Category category;
        string name;
        string profileCID;
        uint256 registeredAt;
        uint256 totalReceived;
    }

    struct Beneficiary {
        bool isWhitelisted; // active flag
        string profileCID;
        uint256 registeredAt;
        uint256 totalReceived;
        uint256 totalSpent;
    }

    struct CategorySpending {
        uint256 foodSpent;
        uint256 medicalSpent;
        uint256 shelterSpent;
    }

    struct Transaction {
        address beneficiary;
        address merchant;
        uint256 amount;
        Category category;
        uint256 timestamp;
        string note;
    }

    // ------------------- STORAGE -------------------

    mapping(address => Merchant) public merchants;
    mapping(address => Beneficiary) public beneficiaries;

    mapping(address => CategorySpending) public beneficiarySpending;
    mapping(address => mapping(Category => uint256)) public spendingLimits;

    mapping(Category => uint256) public defaultLimits;

    // ✅ Arrays for UI / iteration
    address[] public allBeneficiaries;
    address[] public allMerchants;

    // ✅ Prevent duplicates forever
    mapping(address => bool) private beneficiaryExists;
    mapping(address => bool) private merchantExists;

    // ✅ Transaction history
    Transaction[] public transactions;
    mapping(address => uint256[]) public beneficiaryTransactions;
    mapping(address => uint256[]) public merchantTransactions;

    // ✅ Global Stats (accurate all time)
    uint256 public totalBeneficiariesEver;
    uint256 public totalMerchantsEver;

    uint256 public totalActiveBeneficiaries;
    uint256 public totalActiveMerchants;

    uint256 public totalDistributedAllTime;
    uint256 public totalSpentAllTime;

    // ------------------- EVENTS -------------------

    event TreasuryUpdated(address indexed newTreasury, uint256 timestamp);
    event PolToRusdRateUpdated(uint256 newRate, uint256 timestamp);

    event BeneficiaryRegistered(address indexed beneficiary, string profileCID, uint256 timestamp);
    event BeneficiaryRemoved(address indexed beneficiary, uint256 timestamp);
    event BeneficiaryReWhitelisted(address indexed beneficiary, uint256 timestamp);

    event MerchantRegistered(
        address indexed merchant,
        Category category,
        string name,
        string profileCID,
        uint256 timestamp
    );
    event MerchantRemoved(address indexed merchant, uint256 timestamp);
    event MerchantReWhitelisted(address indexed merchant, uint256 timestamp);

    event FundsDistributed(address indexed beneficiary, uint256 amount, uint256 timestamp);

    event FundsSpent(
        address indexed beneficiary,
        address indexed merchant,
        uint256 amount,
        Category category,
        uint256 timestamp
    );

    event SpendingLimitSet(address indexed beneficiary, Category category, uint256 limit, uint256 timestamp);
    event DefaultLimitUpdated(Category category, uint256 newLimit, uint256 timestamp);
    event ProfileCIDUpdated(address indexed user, string newCID, uint256 timestamp);

    // ------------------- CONSTRUCTOR -------------------

    constructor(address _tokenAddress) {
        require(_tokenAddress != address(0), "Invalid token address");
        token = ReliefUSD(_tokenAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        defaultLimits[Category.FOOD] = 2000 * 10 ** 18;
        defaultLimits[Category.MEDICAL] = 1500 * 10 ** 18;
        defaultLimits[Category.SHELTER] = 1500 * 10 ** 18;
    }

    // ------------------- TREASURY SETTINGS -------------------

    function setTreasury(address _treasury) external onlyRole(ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury, block.timestamp);
    }

    function setPolToRusdRate(uint256 _rate) external onlyRole(ADMIN_ROLE) {
        require(_rate > 0, "Invalid rate");
        polToRusdRate = _rate;
        emit PolToRusdRateUpdated(_rate, block.timestamp);
    }

    /**
     * @dev returns max mintable RUSD based on donations
     */
    function getMaxMintableRUSD() public view returns (uint256) {
        if (treasury == address(0)) return 0;
        uint256 donatedPOL = IDonationTreasury(treasury).totalDonatedPOL();
        return donatedPOL * polToRusdRate;
    }

    // ------------------- BENEFICIARY MANAGEMENT -------------------

    function registerBeneficiary(address _beneficiary, string memory _profileCID) external onlyRole(ADMIN_ROLE) {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(bytes(_profileCID).length > 0, "Profile CID required");

        if (!beneficiaryExists[_beneficiary]) {
            beneficiaryExists[_beneficiary] = true;
            allBeneficiaries.push(_beneficiary);
            totalBeneficiariesEver += 1;
        }

        require(!beneficiaries[_beneficiary].isWhitelisted, "Beneficiary already active");

        if (beneficiaries[_beneficiary].registeredAt == 0) {
            beneficiaries[_beneficiary].registeredAt = block.timestamp;
        }

        beneficiaries[_beneficiary].isWhitelisted = true;
        beneficiaries[_beneficiary].profileCID = _profileCID;

        spendingLimits[_beneficiary][Category.FOOD] = defaultLimits[Category.FOOD];
        spendingLimits[_beneficiary][Category.MEDICAL] = defaultLimits[Category.MEDICAL];
        spendingLimits[_beneficiary][Category.SHELTER] = defaultLimits[Category.SHELTER];

        _grantRole(BENEFICIARY_ROLE, _beneficiary);

        totalActiveBeneficiaries += 1;

        emit BeneficiaryRegistered(_beneficiary, _profileCID, block.timestamp);
    }

    function removeBeneficiary(address _beneficiary) external onlyRole(ADMIN_ROLE) {
        require(beneficiaryExists[_beneficiary], "Beneficiary not found");
        require(beneficiaries[_beneficiary].isWhitelisted, "Beneficiary already revoked");

        beneficiaries[_beneficiary].isWhitelisted = false;
        _revokeRole(BENEFICIARY_ROLE, _beneficiary);

        if (totalActiveBeneficiaries > 0) totalActiveBeneficiaries -= 1;

        emit BeneficiaryRemoved(_beneficiary, block.timestamp);
    }

    function reWhitelistBeneficiary(address _beneficiary) external onlyRole(ADMIN_ROLE) {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(beneficiaryExists[_beneficiary], "No beneficiary profile found");
        require(!beneficiaries[_beneficiary].isWhitelisted, "Already active");
        require(bytes(beneficiaries[_beneficiary].profileCID).length > 0, "No profile CID found");

        beneficiaries[_beneficiary].isWhitelisted = true;
        _grantRole(BENEFICIARY_ROLE, _beneficiary);

        totalActiveBeneficiaries += 1;

        emit BeneficiaryReWhitelisted(_beneficiary, block.timestamp);
    }

    function updateBeneficiaryProfile(address _beneficiary, string memory _newCID) external onlyRole(ADMIN_ROLE) {
        require(beneficiaryExists[_beneficiary], "Beneficiary not found");
        require(bytes(_newCID).length > 0, "Profile CID required");

        beneficiaries[_beneficiary].profileCID = _newCID;
        emit ProfileCIDUpdated(_beneficiary, _newCID, block.timestamp);
    }

    function registerBeneficiariesBatch(address[] calldata _beneficiaries, string[] calldata _profileCIDs)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(_beneficiaries.length == _profileCIDs.length, "Array length mismatch");

        for (uint256 i = 0; i < _beneficiaries.length; i++) {
            address b = _beneficiaries[i];
            string memory cid = _profileCIDs[i];

            if (b == address(0)) continue;
            if (bytes(cid).length == 0) continue;
            if (beneficiaries[b].isWhitelisted) continue;

            if (!beneficiaryExists[b]) {
                beneficiaryExists[b] = true;
                allBeneficiaries.push(b);
                totalBeneficiariesEver += 1;
            }

            if (beneficiaries[b].registeredAt == 0) {
                beneficiaries[b].registeredAt = block.timestamp;
            }

            beneficiaries[b].isWhitelisted = true;
            beneficiaries[b].profileCID = cid;

            spendingLimits[b][Category.FOOD] = defaultLimits[Category.FOOD];
            spendingLimits[b][Category.MEDICAL] = defaultLimits[Category.MEDICAL];
            spendingLimits[b][Category.SHELTER] = defaultLimits[Category.SHELTER];

            _grantRole(BENEFICIARY_ROLE, b);
            totalActiveBeneficiaries += 1;

            emit BeneficiaryRegistered(b, cid, block.timestamp);
        }
    }

    // ------------------- MERCHANT MANAGEMENT -------------------

    function registerMerchant(
        address _merchant,
        Category _category,
        string memory _name,
        string memory _profileCID
    ) external onlyRole(ADMIN_ROLE) {
        require(_merchant != address(0), "Invalid merchant address");
        require(bytes(_name).length > 0, "Merchant name required");
        require(bytes(_profileCID).length > 0, "Profile CID required");

        if (!merchantExists[_merchant]) {
            merchantExists[_merchant] = true;
            allMerchants.push(_merchant);
            totalMerchantsEver += 1;
        }

        require(!merchants[_merchant].isRegistered, "Merchant already active");

        if (merchants[_merchant].registeredAt == 0) {
            merchants[_merchant].registeredAt = block.timestamp;
        }

        merchants[_merchant].isRegistered = true;
        merchants[_merchant].category = _category;
        merchants[_merchant].name = _name;
        merchants[_merchant].profileCID = _profileCID;

        _grantRole(MERCHANT_ROLE, _merchant);

        totalActiveMerchants += 1;

        emit MerchantRegistered(_merchant, _category, _name, _profileCID, block.timestamp);
    }

    function removeMerchant(address _merchant) external onlyRole(ADMIN_ROLE) {
        require(merchantExists[_merchant], "Merchant not found");
        require(merchants[_merchant].isRegistered, "Merchant already revoked");

        merchants[_merchant].isRegistered = false;
        _revokeRole(MERCHANT_ROLE, _merchant);

        if (totalActiveMerchants > 0) totalActiveMerchants -= 1;

        emit MerchantRemoved(_merchant, block.timestamp);
    }

    function reWhitelistMerchant(address _merchant) external onlyRole(ADMIN_ROLE) {
        require(_merchant != address(0), "Invalid merchant address");
        require(merchantExists[_merchant], "No merchant profile found");
        require(!merchants[_merchant].isRegistered, "Already active");
        require(bytes(merchants[_merchant].name).length > 0, "No merchant profile found");

        merchants[_merchant].isRegistered = true;
        _grantRole(MERCHANT_ROLE, _merchant);

        totalActiveMerchants += 1;

        emit MerchantReWhitelisted(_merchant, block.timestamp);
    }

    function updateMerchantProfile(address _merchant, string memory _newCID) external onlyRole(ADMIN_ROLE) {
        require(merchantExists[_merchant], "Merchant not found");
        require(bytes(_newCID).length > 0, "Profile CID required");

        merchants[_merchant].profileCID = _newCID;
        emit ProfileCIDUpdated(_merchant, _newCID, block.timestamp);
    }

    function registerMerchantsBatch(
        address[] calldata _merchants,
        Category[] calldata _categories,
        string[] calldata _names,
        string[] calldata _profileCIDs
    ) external onlyRole(ADMIN_ROLE) {
        require(
            _merchants.length == _categories.length &&
                _merchants.length == _names.length &&
                _merchants.length == _profileCIDs.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < _merchants.length; i++) {
            address m = _merchants[i];

            if (m == address(0)) continue;
            if (bytes(_names[i]).length == 0) continue;
            if (bytes(_profileCIDs[i]).length == 0) continue;
            if (merchants[m].isRegistered) continue;

            if (!merchantExists[m]) {
                merchantExists[m] = true;
                allMerchants.push(m);
                totalMerchantsEver += 1;
            }

            if (merchants[m].registeredAt == 0) {
                merchants[m].registeredAt = block.timestamp;
            }

            merchants[m].isRegistered = true;
            merchants[m].category = _categories[i];
            merchants[m].name = _names[i];
            merchants[m].profileCID = _profileCIDs[i];

            _grantRole(MERCHANT_ROLE, m);
            totalActiveMerchants += 1;

            emit MerchantRegistered(m, _categories[i], _names[i], _profileCIDs[i], block.timestamp);
        }
    }

    // ------------------- SPENDING LIMITS -------------------

    function setSpendingLimit(address _beneficiary, Category _category, uint256 _limit) external onlyRole(ADMIN_ROLE) {
        require(beneficiaryExists[_beneficiary], "Beneficiary not found");
        spendingLimits[_beneficiary][_category] = _limit;
        emit SpendingLimitSet(_beneficiary, _category, _limit, block.timestamp);
    }

    function setDefaultLimit(Category _category, uint256 _limit) external onlyRole(ADMIN_ROLE) {
        defaultLimits[_category] = _limit;
        emit DefaultLimitUpdated(_category, _limit, block.timestamp);
    }

    // ------------------- FUND DISTRIBUTION -------------------

   function distributeFunds(address _beneficiary, uint256 _amount) external onlyRole(ADMIN_ROLE) {
    require(beneficiaries[_beneficiary].isWhitelisted, "Beneficiary not active");
    require(_amount > 0, "Amount must be > 0");

    // ✅ Transfer from ReliefManager balance (NOT mint)
    require(token.balanceOf(address(this)) >= _amount, "ReliefManager insufficient RUSD");

    token.managerTransfer(address(this), _beneficiary, _amount);

    beneficiaries[_beneficiary].totalReceived += _amount;
    totalDistributedAllTime += _amount;

    emit FundsDistributed(_beneficiary, _amount, block.timestamp);
}


function distributeFundsBatch(address[] calldata _beneficiaries, uint256[] calldata _amounts)
    external
    onlyRole(ADMIN_ROLE)
{
    require(_beneficiaries.length == _amounts.length, "Array length mismatch");

    for (uint256 i = 0; i < _beneficiaries.length; i++) {
        address b = _beneficiaries[i];
        uint256 amt = _amounts[i];

        if (!beneficiaries[b].isWhitelisted) continue;
        if (amt == 0) continue;

        require(token.balanceOf(address(this)) >= amt, "ReliefManager insufficient RUSD");

        token.managerTransfer(address(this), b, amt);

        beneficiaries[b].totalReceived += amt;
        totalDistributedAllTime += amt;

        emit FundsDistributed(b, amt, block.timestamp);
    }
}


   
    // ------------------- SPEND -------------------

    function spend(address _merchant, uint256 _amount, string memory _note) external onlyRole(BENEFICIARY_ROLE) {
        require(beneficiaries[msg.sender].isWhitelisted, "Beneficiary not active");
        require(merchants[_merchant].isRegistered, "Merchant not active");
        require(_amount > 0, "Amount must be > 0");
        require(token.balanceOf(msg.sender) >= _amount, "Insufficient balance");

        Category category = merchants[_merchant].category;

        uint256 currentCategorySpent = getCategorySpent(msg.sender, category);
        uint256 limit = spendingLimits[msg.sender][category];
        require(currentCategorySpent + _amount <= limit, "Category spending limit exceeded");

        // ✅ No allowance needed because tokens are restricted and managerTransfer handles it.

        if (category == Category.FOOD) beneficiarySpending[msg.sender].foodSpent += _amount;
        else if (category == Category.MEDICAL) beneficiarySpending[msg.sender].medicalSpent += _amount;
        else beneficiarySpending[msg.sender].shelterSpent += _amount;

        beneficiaries[msg.sender].totalSpent += _amount;
        merchants[_merchant].totalReceived += _amount;

        totalSpentAllTime += _amount;

        token.managerTransfer(msg.sender, _merchant, _amount);

        transactions.push(
            Transaction({
                beneficiary: msg.sender,
                merchant: _merchant,
                amount: _amount,
                category: category,
                timestamp: block.timestamp,
                note: _note
            })
        );

        uint256 txId = transactions.length - 1;
        beneficiaryTransactions[msg.sender].push(txId);
        merchantTransactions[_merchant].push(txId);

        emit FundsSpent(msg.sender, _merchant, _amount, category, block.timestamp);
    }

    // ------------------- VIEW HELPERS -------------------

    function getUserRole(address _user)
        external
        view
        returns (
            bool isAdmin,
            bool isBeneficiary,
            bool isMerchant
        )
    {
        return (
            hasRole(ADMIN_ROLE, _user),
            hasRole(BENEFICIARY_ROLE, _user),
            hasRole(MERCHANT_ROLE, _user)
        );
    }

    function getProfileCID(address _user) external view returns (string memory) {
        if (beneficiaryExists[_user]) return beneficiaries[_user].profileCID;
        if (merchantExists[_user]) return merchants[_user].profileCID;
        return "";
    }

    function getCategorySpent(address _beneficiary, Category _category) public view returns (uint256) {
        if (_category == Category.FOOD) return beneficiarySpending[_beneficiary].foodSpent;
        if (_category == Category.MEDICAL) return beneficiarySpending[_beneficiary].medicalSpent;
        return beneficiarySpending[_beneficiary].shelterSpent;
    }

    function getBeneficiaryDetails(address _beneficiary)
        external
        view
        returns (
            bool isWhitelisted,
            string memory profileCID,
            uint256 registeredAt,
            uint256 totalReceived,
            uint256 totalSpent,
            uint256 currentBalance,
            uint256 foodSpent,
            uint256 medicalSpent,
            uint256 shelterSpent,
            uint256 foodLimit,
            uint256 medicalLimit,
            uint256 shelterLimit
        )
    {
        Beneficiary memory ben = beneficiaries[_beneficiary];
        CategorySpending memory spending = beneficiarySpending[_beneficiary];

        return (
            ben.isWhitelisted,
            ben.profileCID,
            ben.registeredAt,
            ben.totalReceived,
            ben.totalSpent,
            token.balanceOf(_beneficiary),
            spending.foodSpent,
            spending.medicalSpent,
            spending.shelterSpent,
            spendingLimits[_beneficiary][Category.FOOD],
            spendingLimits[_beneficiary][Category.MEDICAL],
            spendingLimits[_beneficiary][Category.SHELTER]
        );
    }

    function getMerchantDetails(address _merchant)
        external
        view
        returns (
            bool isRegistered,
            Category category,
            string memory name,
            string memory profileCID,
            uint256 registeredAt,
            uint256 totalReceived,
            uint256 currentBalance
        )
    {
        Merchant memory merch = merchants[_merchant];

        return (
            merch.isRegistered,
            merch.category,
            merch.name,
            merch.profileCID,
            merch.registeredAt,
            merch.totalReceived,
            token.balanceOf(_merchant)
        );
    }

    function getAllBeneficiaries() external view returns (address[] memory) {
        return allBeneficiaries;
    }

    function getAllMerchants() external view returns (address[] memory) {
        return allMerchants;
    }

    function getBeneficiaryTransactions(address _beneficiary) external view returns (uint256[] memory) {
        return beneficiaryTransactions[_beneficiary];
    }

    function getMerchantTransactions(address _merchant) external view returns (uint256[] memory) {
        return merchantTransactions[_merchant];
    }

    function getTransaction(uint256 _txId)
        external
        view
        returns (
            address beneficiary,
            address merchant,
            uint256 amount,
            Category category,
            uint256 timestamp,
            string memory note
        )
    {
        require(_txId < transactions.length, "Invalid transaction ID");
        Transaction memory txn = transactions[_txId];
        return (txn.beneficiary, txn.merchant, txn.amount, txn.category, txn.timestamp, txn.note);
    }

    function getTotalTransactions() external view returns (uint256) {
        return transactions.length;
    }

    function getSystemStats()
        external
        view
        returns (
            uint256 activeBeneficiaries,
            uint256 activeMerchants,
            uint256 totalBeneficiariesRegistered,
            uint256 totalMerchantsRegistered,
            uint256 totalTransactions,
            uint256 totalDistributed,
            uint256 totalSpent,
            uint256 contractETHBalance,
            uint256 maxMintableRUSD,
            uint256 mintedRUSD
        )
    {
        return (
            totalActiveBeneficiaries,
            totalActiveMerchants,
            totalBeneficiariesEver,
            totalMerchantsEver,
            transactions.length,
            totalDistributedAllTime,
            totalSpentAllTime,
            address(this).balance,
            getMaxMintableRUSD(),
            totalMintedRUSD
        );
    }

    function categoryToString(Category _category) public pure returns (string memory) {
        if (_category == Category.FOOD) return "FOOD";
        if (_category == Category.MEDICAL) return "MEDICAL";
        if (_category == Category.SHELTER) return "SHELTER";
        return "UNKNOWN";
    }
}
