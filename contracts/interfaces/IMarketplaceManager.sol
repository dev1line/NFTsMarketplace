// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../Struct.sol";

interface IMarketplaceManager is IERC165Upgradeable {
    function wasBuyer(address account) external view returns (bool);

    // Market Item
    function getMarketItemIdToMarketItem(uint256 marketItemId) external view returns (MarketItem memory);

    function setMarketItemIdToMarketItem(uint256 marketItemId, MarketItem memory value) external;

    function setIsBuyer(address newBuyer) external;

    function extCreateMarketInfo(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _price,
        address _seller,
        uint256 _startTime,
        uint256 _endTime,
        IERC20Upgradeable _paymentToken
    ) external;

    function getListingFee(uint256 amount) external view returns (uint256);

    function extTransferNFTCall(
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        address from,
        address to
    ) external;

    function getCurrentMarketItem() external view returns (uint256);

    function getRoyaltyInfo(
        address _nftAddr,
        uint256 _tokenId,
        uint256 _salePrice
    ) external view returns (address, uint256);

    function isRoyalty(address _contract) external view returns (bool);

    function verify(
        uint256 _marketItemId,
        bytes32[] memory _proof,
        address _account
    ) external view returns (bool);

    function isPrivate(uint256 _marketItemId) external view returns (bool);

    function setNewRootHash(address nftAddress, bytes calldata newRoot) external;
}
