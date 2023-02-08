// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

interface ITokenERC1155 is IERC165Upgradeable {
    function getTokenCounter() external view returns (uint256 tokenId);

    function maxTotalSupply() external view returns (uint256);

    function maxBatch() external view returns (uint256);

    function mint(
        address receiver,
        uint256 amount,
        string memory uri
    ) external;

    function mintBatch(
        address _receiver,
        uint256[] memory _amounts,
        string[] memory _uri
    ) external;
}
