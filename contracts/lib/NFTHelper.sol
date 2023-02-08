// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";

library NFTHelper {
    enum Type {
        ERC721,
        ERC1155,
        NONE
    }

    /**
     *  @notice Check ERC721 contract without error when not support function supportsInterface
     */
    function isERC721(address _account) internal returns (bool) {
        (bool success, ) = _account.call(
            abi.encodeWithSignature("supportsInterface(bytes4)", type(IERC721Upgradeable).interfaceId)
        );

        return success && IERC721Upgradeable(_account).supportsInterface(type(IERC721Upgradeable).interfaceId);
    }

    /**
     *  @notice Check ERC1155 contract without error when not support function supportsInterface
     */
    function isERC1155(address _account) internal returns (bool) {
        (bool success, ) = _account.call(
            abi.encodeWithSignature("supportsInterface(bytes4)", type(IERC1155Upgradeable).interfaceId)
        );

        return success && IERC1155Upgradeable(_account).supportsInterface(type(IERC1155Upgradeable).interfaceId);
    }

    /**
     *  @notice Check royalty without error when not support function supportsInterface
     */
    function isRoyalty(address _account) internal view returns (bool) {
        return ERC165CheckerUpgradeable.supportsInterface(_account, type(IERC2981Upgradeable).interfaceId);
    }

    /**
     *  @notice Check standard of nft contract address
     */
    function getType(address _account) internal returns (Type) {
        if (isERC721(_account)) return Type.ERC721;
        if (isERC1155(_account)) return Type.ERC1155;

        return Type.NONE;
    }

    /**
     *  @notice Transfer nft call
     */
    function transferNFTCall(
        address _nftContractAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _from,
        address _to
    ) internal {
        if (getType(_nftContractAddress) == NFTHelper.Type.ERC721) {
            IERC721Upgradeable(_nftContractAddress).safeTransferFrom(_from, _to, _tokenId);
        } else {
            IERC1155Upgradeable(_nftContractAddress).safeTransferFrom(_from, _to, _tokenId, _amount, "");
        }
    }

    /**
     *  @notice Transfer nft call
     */
    function isTokenExist(address _nftContractAddress, uint256 _tokenId) internal returns (bool) {
        NFTHelper.Type nftType = getType(_nftContractAddress);
        if (nftType == NFTHelper.Type.ERC721) {
            return IERC721Upgradeable(_nftContractAddress).ownerOf(_tokenId) != address(0);
        }

        return nftType == NFTHelper.Type.ERC1155;
    }
}
