// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ReliefUSD
 * @dev Voucher Stablecoin (RUSD) for emergency relief distribution.
 * Transfers are restricted: only authorized managers (ReliefManager, DonationTreasury)
 * can move funds between users.
 */
contract ReliefUSD is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    event ManagerSet(address indexed manager, bool allowed);
    event MinterSet(address indexed minter, bool allowed);

    constructor() ERC20("Relief USD", "RUSD") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    // ✅ MULTI-MANAGER SUPPORT
    function setManager(address manager, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(manager != address(0), "Invalid manager");

        if (allowed) _grantRole(MANAGER_ROLE, manager);
        else _revokeRole(MANAGER_ROLE, manager);

        emit ManagerSet(manager, allowed);
    }

    // Optional helper (admin can add/remove minters)
    function setMinter(address minter, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(minter != address(0), "Invalid minter");

        if (allowed) _grantRole(MINTER_ROLE, minter);
        else _revokeRole(MINTER_ROLE, minter);

        emit MinterSet(minter, allowed);
    }

    // ✅ only MINTER can mint
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(to != address(0), "Cannot mint to zero address");
        _mint(to, amount);
    }

    // burn from caller
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // ✅ MANAGER transfer (ReliefManager & DonationTreasury will use this)
    function managerTransfer(address from, address to, uint256 amount) external onlyRole(MANAGER_ROLE) {
        require(from != address(0), "Invalid from");
        require(to != address(0), "Invalid to");
        _transfer(from, to, amount);
    }

    // ✅ Block direct transfers unless msg.sender is Manager/Admin
    function _update(address from, address to, uint256 amount) internal override {
        // allow mint/burn
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }

        // only managers OR admin can move tokens
        require(
            hasRole(MANAGER_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "RUSD transfers restricted"
        );

        super._update(from, to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
