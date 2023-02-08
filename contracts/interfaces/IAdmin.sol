// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IAdmin is IERC165Upgradeable {
    function isAdmin(address _account) external view returns (bool);

    function owner() external view returns (address);

    function setPermittedPaymentToken(IERC20Upgradeable _paymentToken, bool _allow) external;

    function isPermittedPaymentToken(IERC20Upgradeable token) external view returns (bool);

    function isOwnedMetaCitizen(address account) external view returns (bool);

    function registerTreasury() external;

    function treasury() external view returns (address);

    function registerMetaCitizen() external;

    function metaCitizen() external view returns (address);
}
