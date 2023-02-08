// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./lib/ErrorHelper.sol";

/**
 *  @title  Dev Adminable Contract
 *
 *  @author Marketplace Team
 *
 *  @notice This smart contract is contract to control access and role to call function
 */
contract Adminable is OwnableUpgradeable {
    /**
     *  @notice _admins mapping from token ID to isAdmin status
     */
    mapping(address => bool) public admins;

    event SetAdmin(address indexed user, bool allow);

    modifier onlyAdmin() {
        if (!(owner() == _msgSender() || admins[_msgSender()])) {
            revert ErrorHelper.CallerIsNotOwnerOrAdmin();
        }
        _;
    }

    modifier notZeroAddress(address _addr) {
        ErrorHelper._checkValidAddress(_addr);
        _;
    }

    modifier notZeroAmount(uint256 _amount) {
        ErrorHelper._checkValidAmount(_amount);
        _;
    }

    // solhint-disable-next-line func-name-mixedcase
    function __Adminable_init() internal onlyInitializing {
        OwnableUpgradeable.__Ownable_init();
    }

    /**
     *  @notice Replace the admin role by another address.
     *
     *  @dev    Only owner can call this function.
     */
    function setAdmin(address _user, bool _allow) public virtual onlyOwner {
        _setAdmin(_user, _allow);
    }

    function _setAdmin(address _user, bool _allow) internal virtual notZeroAddress(_user) {
        admins[_user] = _allow;
        emit SetAdmin(_user, _allow);
    }

    /**
     *  @notice Check account whether it is the admin role.
     */
    function isAdmin(address _account) external view returns (bool) {
        return admins[_account];
    }
}
