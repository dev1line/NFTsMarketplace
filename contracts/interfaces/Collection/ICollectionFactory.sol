// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

interface ICollectionFactory is IERC165Upgradeable {
    function checkCollectionOfUser(address _user, address _nft) external view returns (bool);
}
