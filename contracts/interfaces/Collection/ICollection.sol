// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

interface ICollection is IERC165Upgradeable {
    function initialize(
        address _owner,
        string memory _name,
        string memory _symbol,
        uint256 _totalSuply,
        address _receiverRoyalty,
        uint96 _feeNumerator
    ) external;

    function setAdminByFactory(address _user, bool _allow) external;
}
