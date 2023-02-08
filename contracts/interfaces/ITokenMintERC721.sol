// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

interface ITokenMintERC721 is IERC165Upgradeable {
    function getTokenCounter() external view returns (uint256 tokenId);

    function mint(address receiver, string memory uri) external;
}
